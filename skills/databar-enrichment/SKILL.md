---
name: databar-enrichment
description: Run a single data enrichment via Databar. Use when the user asks to look up, find, or enrich one data point — a person, company, email, phone number, LinkedIn profile, domain, or any other entity. Requires the Databar MCP server.
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
  tags: [data-enrichment, api, databar, lookup]
---

# Databar Single Enrichment

Run a data enrichment on Databar.ai to look up information about a person, company, email, phone number, or any other entity using 100+ data providers.

## Workflow

1. **Extract the intent.** Identify what the user wants to look up and what entity type it is (person, company, email, phone, domain, etc.).

2. **Search for the right enrichment.**
   Call `search_enrichments` with a descriptive query.
   - For people: try queries like "linkedin profile", "person lookup", "contact info"
   - For companies: "company data", "domain lookup", "technographics"
   - For emails: "email finder", "email verification"
   - For phones: "phone lookup", "mobile number"
   - Use the `category` filter when helpful: `people`, `company`, `email`, `phone`, `social`, `financial`, `verification`

3. **Inspect the enrichment before running.**
   Call `get_enrichment_details` with the `enrichment_id` from step 2. Check:
   - Required parameters — make sure you have all of them from the user's input
   - Price — note the credit cost
   - If you're missing a required parameter, ask the user for it

4. **Confirm cost with the user.**
   Tell the user: "This will cost {price} credits using {enrichment_name}. Proceed?"
   If the user has not confirmed willingness to spend credits, always ask first.

5. **Run the enrichment.**
   Call `run_enrichment` with `enrichment_id` and `params`.
   - The server handles async polling automatically
   - Results are cached for 24 hours; repeated lookups are free
   - Use `skip_cache: true` only if the user explicitly wants fresh data

6. **Present results clearly.**
   Format the returned data as a readable summary. Highlight the most relevant fields based on the user's original question.

## Error handling

- **"Insufficient balance"**: Tell the user their credit balance is too low. Suggest checking with `get_user_balance`.
- **"Resource has expired" / status "gone"**: Task data is deleted after 1 hour. The enrichment needs to be re-run.
- **Missing parameters**: Ask the user for the missing values. Don't guess.
- **No results found**: Suggest trying a different enrichment or data provider for the same task.

## Examples

### Example 1: LinkedIn profile lookup
**User**: "Get me the LinkedIn profile for Sarah Chen at Stripe"
1. `search_enrichments({ query: "linkedin profile" })`
2. Pick the best match, e.g. ID 42 — "LinkedIn Profile Lookup" at 2 credits
3. `get_enrichment_details({ enrichment_id: 42 })`
4. Confirm: "This will cost 2 credits. Proceed?"
5. `run_enrichment({ enrichment_id: 42, params: { full_name: "Sarah Chen", company: "Stripe" } })`
6. Present profile summary

### Example 2: Email verification
**User**: "Is david@databar.ai a valid email?"
1. `search_enrichments({ query: "email verification", category: "verification" })`
2. Pick match, e.g. ID 15 — "Email Verifier" at 0.5 credits
3. Confirm cost, then run
4. `run_enrichment({ enrichment_id: 15, params: { email: "david@databar.ai" } })`
5. Present verification result (valid/invalid, deliverable, catch-all, etc.)

### Example 3: Company domain lookup
**User**: "What can you tell me about openai.com?"
1. `search_enrichments({ query: "company data", category: "company" })`
2. Pick match, confirm cost
3. `run_enrichment({ enrichment_id: ..., params: { domain: "openai.com" } })`
4. Present company info (name, industry, size, location, funding, etc.)
