---
name: databar-waterfall
description: Run a waterfall enrichment via Databar that tries multiple data providers in sequence until one succeeds. Use when the user wants to maximize success rate for finding data (emails, phones, profiles), mentions "waterfall", or wants to try multiple sources. Works for single lookups and bulk lists. Requires the Databar MCP server.
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
  tags: [data-enrichment, waterfall, multi-provider, databar]
---

# Databar Waterfall Enrichment

Waterfalls try multiple data providers in sequence until one returns a result. This maximizes the chance of finding the data. For example, an "email finder" waterfall might try Provider A first, and if it fails, try Provider B, then C — stopping as soon as one succeeds.

## When to use this vs a regular enrichment

- **Waterfall**: User wants the highest chance of finding the data and doesn't care which provider returns it. Best for email finding, phone lookups, and contact discovery.
- **Regular enrichment** (`databar-enrichment` skill): User wants data from a specific provider, or the task only has one relevant provider.

## Workflow

1. **Identify the user's goal.** Common waterfall use cases:
   - Finding someone's email address (given name + company)
   - Looking up a phone number
   - Finding social profiles
   - Any task where the user wants to "try everything"

2. **Search for available waterfalls.**
   Call `search_waterfalls` with a descriptive query (e.g. "email finder", "phone lookup").

3. **Pick the best waterfall.**
   Review the results. Check:
   - `identifier` — the string you'll pass to run it
   - `input_params` — required parameters
   - `available_enrichments` count — more providers = higher success rate

4. **Determine single vs bulk.**
   - If the user provides one record: use `run_waterfall`
   - If the user provides multiple records: use `run_bulk_waterfall`

5. **Confirm cost with the user.**
   Waterfall pricing varies by provider. Tell the user the waterfall name and that costs depend on which provider succeeds.
   - For bulk: "Running {waterfall_name} on {count} records. Cost depends on which providers succeed."

6. **Run the waterfall.**

   **Single record:**
   ```
   run_waterfall({
     waterfall_identifier: "email_getter",
     params: { full_name: "John Smith", company_name: "Google" }
   })
   ```

   **Multiple records:**
   ```
   run_bulk_waterfall({
     waterfall_identifier: "email_getter",
     params_list: [
       { full_name: "John Smith", company_name: "Google" },
       { full_name: "Jane Doe", company_name: "Microsoft" }
     ]
   })
   ```

   Optional parameters:
   - `provider_ids`: Limit to specific providers (by default, all are used in cost-optimized order)
   - `email_verifier`: Pass an email verifier enrichment ID to auto-verify found emails

7. **Present results.**
   For single lookups, show the result directly.
   For bulk, format as a markdown table with one row per input.

## Error handling

- **No waterfall found**: If `search_waterfalls` returns nothing, fall back to `search_enrichments` and use a regular enrichment instead.
- **All providers failed**: The waterfall tried every provider and none succeeded. Tell the user and suggest checking their input data (e.g. typos in names or companies).
- **"Resource has expired" / status "gone"**: Task data is deleted after 1 hour. Re-run the waterfall.

## Examples

### Example 1: Find one email
**User**: "Find the email for David Kim at Databar"
1. `search_waterfalls({ query: "email finder" })`
2. Pick "email_getter" waterfall
3. Confirm: "I'll use the Email Finder waterfall which tries multiple providers. Proceed?"
4. `run_waterfall({ waterfall_identifier: "email_getter", params: { full_name: "David Kim", company_name: "Databar" } })`
5. Present: "Found: david@databar.ai (verified, from Provider B)"

### Example 2: Bulk phone lookup
**User**: "Find phone numbers for these 5 people: [list]"
1. `search_waterfalls({ query: "phone lookup" })`
2. Pick "phone_finder" waterfall
3. Confirm cost
4. `run_bulk_waterfall({ waterfall_identifier: "phone_finder", params_list: [...] })`
5. Present results table:
   | Name | Company | Phone | Provider |
   |------|---------|-------|----------|
   | ... | ... | ... | ... |

### Example 3: Email finder with verification
**User**: "Find and verify emails for this list"
1. `search_waterfalls({ query: "email finder" })` -> "email_getter"
2. `search_enrichments({ query: "email verification" })` -> find verifier ID (e.g. 15)
3. `run_bulk_waterfall({ waterfall_identifier: "email_getter", params_list: [...], email_verifier: 15 })`
4. Results include both the found email and verification status
