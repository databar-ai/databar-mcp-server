# Databar MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that enables AI assistants like Claude to interact with [Databar.ai](https://databar.ai)'s data enrichment API. Discover, configure, and run data enrichments across hundreds of data providers using natural language.

## Features

- **Smart Enrichment Discovery** — Search and filter enrichments by keyword or category
- **Natural Language Interface** — Ask "get David's LinkedIn profile" and the right enrichment runs automatically
- **Bulk Operations** — Enrich many records in a single call with bulk enrichment and bulk waterfall support
- **Table Management** — Create tables, manage columns, insert/update/upsert rows
- **Waterfall Support** — Try multiple data providers sequentially until one succeeds
- **Async Handling** — Automatic polling for results with no manual intervention
- **Intelligent Caching** — 24-hour result cache reduces API calls and costs
- **Error Handling** — Retries with exponential backoff and clear error messages

## Quick Start

### Prerequisites

- Node.js 18+
- A Databar.ai API key ([get one here](https://databar.ai))

### Install & Build

```bash
git clone https://github.com/databar-ai/databar-mcp-server.git
cd databar-mcp-server
npm install
npm run build
```

### Configure Claude Desktop

Edit your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "databar": {
      "command": "node",
      "args": ["/absolute/path/to/databar-mcp-server/dist/index.js"],
      "env": {
        "DATABAR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. Verify by asking: *"What Databar tools do you have access to?"*

## Usage Examples

### Find someone's LinkedIn profile

> *"Get me David Abaev's LinkedIn profile"*

Claude searches for LinkedIn enrichments, picks the right one, runs it, and returns the profile data.

### Verify an email address

> *"Verify the email david@databar.ai"*

### Find an email using waterfall

> *"Find the email for John Smith at Google"*

Runs a waterfall that tries multiple providers until one returns a result.

### Bulk enrich a list

> *"Enrich these 10 emails with company data: [list]"*

Uses bulk enrichment to process all records in a single API call.

### Manage table data

> *"List my tables"*  
> *"Create 5 rows in table abc-123 with columns name and email"*  
> *"Get the columns for table abc-123"*

## Available Tools

### Enrichments

| Tool | Description |
|------|-------------|
| `search_enrichments` | Search enrichments by keyword or category |
| `get_enrichment_details` | Get parameters, pricing, and response fields for an enrichment |
| `run_enrichment` | Run a single enrichment (with auto-polling and caching) |
| `run_bulk_enrichment` | Run an enrichment on multiple inputs at once |

### Waterfalls

| Tool | Description |
|------|-------------|
| `search_waterfalls` | Search available waterfall enrichments |
| `run_waterfall` | Run a waterfall (tries providers sequentially) |
| `run_bulk_waterfall` | Run a waterfall on multiple inputs at once |

### Tables

| Tool | Description |
|------|-------------|
| `create_table` | Create a new empty table |
| `list_tables` | List all tables in your workspace |
| `get_table_columns` | Get column schema for a table |
| `get_table_rows` | Get rows with pagination |
| `get_table_enrichments` | List enrichments configured on a table |
| `add_table_enrichment` | Add an enrichment to a table with column mapping |
| `run_table_enrichment` | Trigger an enrichment on all rows in a table |

### Row Operations

| Tool | Description |
|------|-------------|
| `create_rows` | Insert up to 50 rows with deduplication options |
| `patch_rows` | Update fields on existing rows by ID |
| `upsert_rows` | Insert or update rows based on a matching key |

### Account

| Tool | Description |
|------|-------------|
| `get_user_balance` | Get credit balance and account info |

## Configuration

All settings are configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABAR_API_KEY` | *(required)* | Your Databar API key |
| `DATABAR_BASE_URL` | `https://api.databar.ai/v1` | API base URL |
| `CACHE_TTL_HOURS` | `24` | Result cache TTL in hours |
| `MAX_POLL_ATTEMPTS` | `150` | Max polling attempts for async tasks |
| `POLL_INTERVAL_MS` | `2000` | Polling interval in ms |

## How It Works

### Async Task Handling

1. Server sends a run request to the Databar API
2. API returns a `task_id`
3. Server automatically polls `/v1/tasks/{task_id}` every 2 seconds
4. When status is `completed`, results are returned
5. If data has expired (1-hour retention), `gone` status is handled gracefully

### Caching

- Results are cached for 24 hours by default
- Cache key: enrichment ID + serialized params
- Cached results don't consume credits
- Use `skip_cache: true` to force fresh data

### Smart Categorization

Enrichments are automatically categorized (People, Company, Email, Phone, Social, Financial, Verification) to help the AI assistant pick the right tool.

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

### Project Structure

```
databar-mcp-server/
├── src/
│   ├── index.ts           # MCP server entry point & tool handlers
│   ├── databar-client.ts  # Databar API client with polling
│   ├── cache.ts           # In-memory cache with TTL
│   ├── types.ts           # TypeScript type definitions
│   └── utils.ts           # Helpers & categorization
├── dist/                  # Compiled output (generated)
├── package.json
├── tsconfig.json
└── .gitignore
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server not connecting | Verify API key, rebuild (`npm run build`), restart Claude Desktop |
| "No enrichments found" | Try a broader search query; list cache refreshes every 5 minutes |
| "Task timed out" | Some enrichments take longer; increase `MAX_POLL_ATTEMPTS` |
| "Task data has expired" | Data is stored for 1 hour only; re-run the enrichment |
| "Invalid API key" | Check `.env` or Claude Desktop config for typos/extra spaces |

## Resources

- [Databar API Documentation](https://apiv3.databar.ai)
- [Databar Web App](https://databar.ai)
- [MCP Protocol Docs](https://modelcontextprotocol.io)

## License

MIT
