---
name: databar-table-enrichment
description: Create a Databar table, add rows, attach an enrichment, and run it on all rows. Use when the user wants to enrich a dataset at scale using Databar's table infrastructure — e.g. "enrich these 50 leads", "create a table with this data and find their emails". Requires the Databar MCP server.
license: MIT
compatibility:
  - Claude Code
  - Cursor
  - OpenAI Codex
  - Gemini CLI
  - OpenClaw
  - Windsurf
  - GitHub Copilot
metadata:
  author: Databar.ai
  version: 1.0.0
  tags: [data-enrichment, tables, bulk, pipeline, databar]
---

# Databar Table-Driven Enrichment

Build a complete data enrichment pipeline: create a table, insert rows, configure an enrichment, run it on every row, and send the user a link to view results in the Databar UI.

## When to use this skill

Use this when the user:
- Has a list of data (leads, companies, domains, emails) they want enriched
- Wants results stored in a persistent table they can access later
- Wants to run enrichments on a large dataset with a sharable link
- Says things like "create a table and enrich it" or "I want to enrich these rows"

If the user just wants quick results without a table, use the `databar-bulk-enrichment` skill instead.

## Workflow

### Phase 1: Prepare the data

1. **Parse the user's input.** Extract the list of records. Accept CSV, JSON, plain text lists, or inline data. Identify the column names.

2. **Create a table.**
   Call `create_table` with the table `name` and the `columns` inferred from the user's data. Save the returned `table_uuid`.
   ```
   create_table({ name: "Leads", columns: ["name", "company", "email"] })
   ```

3. **Insert rows.**
   Call `create_rows` with `table_uuid`, `rows`, and `options: { allow_new_columns: true }`.
   - Each row: `{ fields: { "column_name": "value", ... } }`
   - Max 100 rows per request. If more than 100, split into batches and call `create_rows` for each batch.
   - Use `allow_new_columns: true` so any extra columns in the data are auto-created.

4. **Verify the insert.**
   Call `get_table_columns` with the `table_uuid` to confirm columns were created correctly.

### Phase 2: Configure the enrichment

5. **Find the right enrichment.**
   Call `search_enrichments` with a query matching the user's goal (e.g. "email finder", "company data").

6. **Inspect it.**
   Call `get_enrichment_details` to see required parameters, price, and choices for any `select`/`mselect` params.

7. **Resolve choices for select/mselect params.**
   The column mapping uses table column names as values — so the enrichment runs each column value through the param. However, if a param has `choices`, the column values in the table must be valid choice `id`s.
   - `choices.mode = "inline"` — valid ids are in `choices.items[].id`
   - `choices.mode = "remote"` — call `get_param_choices` to browse valid ids
   - Warn the user if their data contains values that don't match valid choice ids.

8. **Build the column mapping.**
   Map enrichment parameter names to table column names. This tells Databar which column to read for each enrichment input.
   - Example: enrichment needs `domain`, table column is `company_domain` → `{ "domain": { "value": "company_domain", "type": "mapping" } }`
   - Parameter names must match the enrichment's required params exactly.
   - Column names must match the table's actual column names (check with `get_table_columns`).

9. **Confirm cost with the user.**
   Estimated cost = number of rows × price per enrichment. Tell the user: "This will enrich {row_count} rows at {price} credits each = ~{total} credits total. Proceed?"

10. **Add the enrichment to the table.**
    Call `add_table_enrichment` with `table_uuid`, `enrichment_id`, and `mapping`.

### Phase 3: Run and deliver

11. **Run the enrichment.**
    Call `run_table_enrichment` with `table_uuid` and the `enrichment_id` returned from step 10.

12. **Provide the table link.**
    Tell the user: "Your enrichment is running. View results at: `https://databar.ai/table/{table_uuid}`"
    Results will populate as enrichments complete.

## Error handling

- **Column mapping mismatch**: If `add_table_enrichment` fails, check that mapping keys match the enrichment's parameter names and mapping values match the table's column names. Use `get_table_columns` and `get_enrichment_details` to debug.
- **Batch size exceeded**: Max 100 rows per `create_rows` call. Split larger datasets into chunks of 100.
- **Insufficient balance**: Total cost = rows x price. Warn the user and suggest reducing the dataset or checking balance with `get_user_balance`.

## Examples

### Example: Enrich a lead list with emails
**User**: "Here are 30 leads with name and company. Find their emails."

```
John Smith, Google
Jane Doe, Microsoft
...
```

1. `create_table({ name: "Leads", columns: ["name", "company"] })` -> get `table_uuid`
2. `create_rows({ table_uuid, rows: [{ fields: { name: "John Smith", company: "Google" } }, ...], options: { allow_new_columns: true } })`
3. `search_enrichments({ query: "email finder" })` -> pick best match (e.g. ID 23)
4. `get_enrichment_details({ enrichment_id: 23 })` -> needs `full_name`, `company_name` (both `text`, no choices)
5. Confirm: "30 rows x 2 credits = ~60 credits. Proceed?"
6. `add_table_enrichment({ table_uuid, enrichment_id: 23, mapping: { "full_name": { "value": "name", "type": "mapping" }, "company_name": { "value": "company", "type": "mapping" } } })`
7. `run_table_enrichment({ table_uuid, enrichment_id: "..." })`
8. "Your enrichment is running! View results at: https://databar.ai/table/{table_uuid}"
