---
name: databar-bulk-enrichment
description: Run a data enrichment on multiple records at once via Databar. Use when the user provides a list of items to enrich (CSV, array, multiple names/emails/companies) and wants quick inline results without creating a table. Requires the Databar MCP server.
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
  tags: [data-enrichment, bulk, batch, databar]
---

# Databar Bulk Enrichment

Enrich a list of records in a single operation and return results inline. Unlike the table-driven skill, this returns data directly to the conversation without creating a persistent table.

## When to use this vs table-driven enrichment

- **Bulk enrichment** (this skill): User wants quick results returned directly. Good for smaller lists (up to 100 items).
- **Table-driven enrichment** (`databar-table-enrichment` skill): User wants a persistent table with a link, or has more than 100 items, or wants to run multiple enrichments on the same dataset.

## Workflow

1. **Parse the user's input list.**
   Accept any format: CSV, JSON, comma-separated, numbered list, plain text. Extract each record's fields.

2. **Determine enrichment vs waterfall.**
   - If the user wants to try multiple providers (e.g. "find emails using all available sources"), use `search_waterfalls` and `run_bulk_waterfall`. See the `databar-waterfall` skill.
   - Otherwise, use `search_enrichments` and `run_bulk_enrichment`.

3. **Find the right enrichment.**
   Call `search_enrichments` with a query matching the task.

4. **Inspect it.**
   Call `get_enrichment_details` to check required parameters, price per record, and choices for any `select`/`mselect` params.

5. **Resolve choices for select/mselect params.**
   If any param has a `choices` object, you must use valid `id` values (not display names) when building `params_list`.
   - `choices.mode = "inline"` — pick from `choices.items[].id` directly.
   - `choices.mode = "remote"` — call `get_param_choices({ enrichment_id, param_name })` to get valid options. Use `q` to search if needed.
   - `mselect` params accept an **array** of ids.

6. **Validate the list.**
   - Max 100 items per request. If the user provides more, warn them and either:
     - Truncate to 100 with their approval
     - Suggest using the table-driven skill for larger datasets
   - Ensure each record has the required parameters. Flag any incomplete records.

7. **Estimate and confirm cost.**
   Calculate: `item_count x price_per_enrichment = total_cost`.
   Tell the user: "Enriching {count} records at {price} credits each = ~{total} credits. Proceed?"

8. **Build the params_list.**
   Transform the user's data into an array of parameter objects matching the enrichment's required params.
   ```
   params_list: [
     { "email": "alice@example.com" },
     { "email": "bob@example.com" },
     ...
   ]
   ```

9. **Run the bulk enrichment.**
   Call `run_bulk_enrichment` with `enrichment_id` and `params_list`.

10. **Format results as a table.**
    Present results as a markdown table. Include the original input fields plus key result fields.

    | Email | Status | Deliverable | Provider |
    |-------|--------|-------------|----------|
    | alice@example.com | valid | yes | ... |
    | bob@example.com | invalid | no | ... |

    Summarize: "X of Y records enriched successfully."

## Error handling

- **List too large**: If over 100 items, suggest table-driven enrichment or ask user to trim the list.
- **Incomplete records**: Flag records missing required parameters. Ask the user to fill in gaps, or skip them.
- **Partial failures**: Some records may fail while others succeed. Present successful results and list failures separately.
- **Insufficient balance**: Total cost may exceed balance. Suggest checking with `get_user_balance` or reducing the list.
- **"Resource has expired"**: Task data only lives for 1 hour. Re-run if needed.

## Examples

### Example 1: Verify a list of emails
**User**: "Verify these emails: alice@google.com, bob@fake.xyz, carol@stripe.com"

1. Parse: 3 emails
2. `search_enrichments({ query: "email verification", category: "verification" })`
3. Pick verifier (ID 15, 0.5 credits each)
4. Confirm: "3 emails x 0.5 credits = 1.5 credits. Proceed?"
5. `run_bulk_enrichment({ enrichment_id: 15, params_list: [{ email: "alice@google.com" }, { email: "bob@fake.xyz" }, { email: "carol@stripe.com" }] })`
6. Present:

   | Email | Valid | Deliverable | Catch-all |
   |-------|-------|-------------|-----------|
   | alice@google.com | yes | yes | no |
   | bob@fake.xyz | no | no | no |
   | carol@stripe.com | yes | yes | no |

   "2 of 3 emails are valid."

### Example 2: Company data for a domain list
**User**: "Get company info for: openai.com, stripe.com, notion.so, databar.ai"

1. Parse: 4 domains
2. `search_enrichments({ query: "company data", category: "company" })`
3. Pick enrichment, confirm cost
4. `run_bulk_enrichment({ enrichment_id: ..., params_list: [{ domain: "openai.com" }, { domain: "stripe.com" }, { domain: "notion.so" }, { domain: "databar.ai" }] })`
5. Present company details table

### Example 3: Large list handling
**User**: Provides 250 email addresses

1. Parse: 250 items (exceeds 100 limit)
2. "You have 250 records. Bulk enrichment supports up to 100 at a time. I recommend using the table-driven approach — I'll create a Databar table, insert all 250 rows, and run the enrichment there. You'll get a link to view results. Want me to do that instead?"
3. If yes, hand off to the `databar-table-enrichment` workflow.
4. If no, offer to process the first 100 and then the next 100 in two batches.
