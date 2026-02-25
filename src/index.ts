#!/usr/bin/env node

/**
 * Databar MCP Server
 * Enables AI assistants to interact with Databar.ai's enrichment API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { DatabarClient } from './databar-client.js';
import { Cache } from './cache.js';
import {
  categorizeEnrichment,
  searchEnrichments,
  filterByCategory,
  formatEnrichmentForDisplay,
  formatWaterfallForDisplay,
  formatResults,
  getRequiredParams,
  validateParams,
  formatTableForDisplay,
  formatColumnForDisplay,
  formatTableEnrichmentForDisplay,
  formatCreateRowsResponse,
  formatPatchRowsResponse,
  formatUpsertRowsResponse
} from './utils.js';
import { DatabarConfig, CategorizedEnrichment, EnrichmentCategory } from './types.js';

dotenv.config();

const API_KEY = process.env.DATABAR_API_KEY;
if (!API_KEY) {
  console.error('Error: DATABAR_API_KEY environment variable is required');
  process.exit(1);
}

const config: DatabarConfig = {
  apiKey: API_KEY,
  baseUrl: process.env.DATABAR_BASE_URL || 'https://api.databar.ai/v1',
  cacheTtlHours: parseInt(process.env.CACHE_TTL_HOURS || '24'),
  maxPollAttempts: parseInt(process.env.MAX_POLL_ATTEMPTS || '150'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '2000'),
};

const databarClient = new DatabarClient(config);
const cache = new Cache(config.cacheTtlHours);

let enrichmentsCache: CategorizedEnrichment[] | null = null;
let enrichmentsCacheTime: number = 0;
const ENRICHMENTS_CACHE_TTL = 5 * 60 * 1000;

async function getCachedEnrichments(): Promise<CategorizedEnrichment[]> {
  const now = Date.now();
  
  if (enrichmentsCache && (now - enrichmentsCacheTime) < ENRICHMENTS_CACHE_TTL) {
    return enrichmentsCache;
  }

  const enrichments = await databarClient.getAllEnrichments();
  enrichmentsCache = enrichments.map(categorizeEnrichment);
  enrichmentsCacheTime = now;
  
  return enrichmentsCache;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
  // --- Enrichment tools ---
  {
    name: 'search_enrichments',
    description: 'Search and discover available data enrichments. Use this to find the right enrichment for a specific task (e.g., "linkedin profile", "email finder", "company data"). Returns a list of matching enrichments with their IDs, descriptions, required parameters, and pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find enrichments (e.g., "linkedin", "email verification", "company data")'
        },
        category: {
          type: 'string',
          enum: ['people', 'company', 'email', 'phone', 'social', 'financial', 'verification', 'other'],
          description: 'Optional: Filter by category'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_enrichment_details',
    description: 'Get detailed information about a specific enrichment, including all required and optional parameters, response fields, pricing, and data source. Use this before running an enrichment to understand what parameters are needed.',
    inputSchema: {
      type: 'object',
      properties: {
        enrichment_id: {
          type: 'number',
          description: 'The ID of the enrichment to get details for'
        }
      },
      required: ['enrichment_id']
    }
  },
  {
    name: 'run_enrichment',
    description: 'Execute a data enrichment with the provided parameters. Automatically handles async execution and polling, returning final results. Results are cached for 24 hours to reduce costs.',
    inputSchema: {
      type: 'object',
      properties: {
        enrichment_id: {
          type: 'number',
          description: 'The ID of the enrichment to run'
        },
        params: {
          type: 'object',
          description: 'Parameters required by the enrichment (e.g., {"email": "test@example.com"})',
          additionalProperties: true
        },
        skip_cache: {
          type: 'boolean',
          description: 'Skip cache and fetch fresh data (default: false)',
          default: false
        }
      },
      required: ['enrichment_id', 'params']
    }
  },
  {
    name: 'run_bulk_enrichment',
    description: 'Execute an enrichment on multiple inputs at once. Provide an array of parameter objects. Automatically handles async execution and polling. Use this when you need to enrich many records in a single call.',
    inputSchema: {
      type: 'object',
      properties: {
        enrichment_id: {
          type: 'number',
          description: 'The ID of the enrichment to run'
        },
        params_list: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: 'Array of parameter objects, one per record (e.g., [{"email": "a@b.com"}, {"email": "c@d.com"}])'
        }
      },
      required: ['enrichment_id', 'params_list']
    }
  },

  // --- Waterfall tools ---
  {
    name: 'search_waterfalls',
    description: 'Search available waterfall enrichments. Waterfalls try multiple data providers in sequence until one succeeds, maximizing data retrieval success rate.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "email finder", "phone lookup")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'run_waterfall',
    description: 'Execute a waterfall enrichment that tries multiple providers until one succeeds. Returns the result along with details about which providers were tried and their costs.',
    inputSchema: {
      type: 'object',
      properties: {
        waterfall_identifier: {
          type: 'string',
          description: 'The identifier of the waterfall to run (e.g., "email_getter")'
        },
        params: {
          type: 'object',
          description: 'Parameters required by the waterfall',
          additionalProperties: true
        },
        provider_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional: Specific provider IDs to use (default: uses all in cost-optimized order)'
        },
        email_verifier: {
          type: 'number',
          description: 'Optional: Email verifier enrichment ID to verify results'
        }
      },
      required: ['waterfall_identifier', 'params']
    }
  },
  {
    name: 'run_bulk_waterfall',
    description: 'Execute a waterfall enrichment on multiple inputs at once. Provide an array of parameter objects. Use this when you need to process many records through a waterfall in a single call.',
    inputSchema: {
      type: 'object',
      properties: {
        waterfall_identifier: {
          type: 'string',
          description: 'The identifier of the waterfall to run'
        },
        params_list: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: 'Array of parameter objects, one per record'
        },
        provider_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional: Specific provider IDs to use'
        },
        email_verifier: {
          type: 'number',
          description: 'Optional: Email verifier enrichment ID'
        }
      },
      required: ['waterfall_identifier', 'params_list']
    }
  },

  // --- Table tools ---
  {
    name: 'create_table',
    description: 'Create a new empty table in your Databar workspace.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_tables',
    description: 'List all tables in your Databar workspace. Returns table UUIDs, names, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_table_columns',
    description: 'Get all columns defined on a table. Returns column names, types, and identifiers.',
    inputSchema: {
      type: 'object',
      properties: {
        table_uuid: {
          type: 'string',
          description: 'The UUID of the table'
        }
      },
      required: ['table_uuid']
    }
  },
  {
    name: 'get_table_rows',
    description: 'Get rows from a table with pagination. Returns up to 1000 rows per page by default.',
    inputSchema: {
      type: 'object',
      properties: {
        table_uuid: {
          type: 'string',
          description: 'The UUID of the table'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          default: 1
        },
        per_page: {
          type: 'number',
          description: 'Rows per page (default: 1000, max: 1000)',
          default: 1000
        }
      },
      required: ['table_uuid']
    }
  },
  {
    name: 'create_rows',
    description: 'Insert new rows into a table. Supports up to 50 rows per request, with options for deduplication, auto-creating columns, and insert position.',
    inputSchema: {
      type: 'object',
      properties: {
        table_id: {
          type: 'string',
          description: 'The ID of the table'
        },
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fields: {
                type: 'object',
                description: 'Map of column keys to values',
                additionalProperties: true
              }
            },
            required: ['fields']
          },
          description: 'Array of row records to insert (max 50)',
          maxItems: 50
        },
        options: {
          type: 'object',
          properties: {
            allowNewColumns: {
              type: 'boolean',
              description: 'Auto-create columns that don\'t exist (default: false)'
            },
            typecast: {
              type: 'boolean',
              description: 'Attempt type coercion (default: true)'
            },
            dedupe: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                keys: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Field keys used for duplicate detection'
                }
              }
            }
          },
          description: 'Optional insert options'
        }
      },
      required: ['table_id', 'records']
    }
  },
  {
    name: 'patch_rows',
    description: 'Update specific fields on existing rows by row ID. Supports up to 50 rows per request.',
    inputSchema: {
      type: 'object',
      properties: {
        table_id: {
          type: 'string',
          description: 'The ID of the table'
        },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Row ID to update' },
              fields: { type: 'object', description: 'Fields to update', additionalProperties: true }
            },
            required: ['id', 'fields']
          },
          description: 'Array of patch operations (max 50)',
          maxItems: 50
        },
        overwrite: {
          type: 'boolean',
          description: 'If false, non-empty cells will not be overwritten (default: true)',
          default: true
        }
      },
      required: ['table_id', 'rows']
    }
  },
  {
    name: 'upsert_rows',
    description: 'Insert or update rows based on a matching key. If a row with the key exists, it is updated; otherwise a new row is created. Supports up to 50 rows per request.',
    inputSchema: {
      type: 'object',
      properties: {
        table_id: {
          type: 'string',
          description: 'The ID of the table'
        },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'object',
                description: 'Key field(s) to match on (V1 supports one key field)',
                additionalProperties: true
              },
              fields: {
                type: 'object',
                description: 'Fields to set on the row',
                additionalProperties: true
              }
            },
            required: ['key', 'fields']
          },
          description: 'Array of upsert operations (max 50)',
          maxItems: 50
        }
      },
      required: ['table_id', 'rows']
    }
  },
  {
    name: 'get_table_enrichments',
    description: 'List all enrichments configured on a table. Returns enrichment IDs and names.',
    inputSchema: {
      type: 'object',
      properties: {
        table_uuid: {
          type: 'string',
          description: 'The UUID of the table'
        }
      },
      required: ['table_uuid']
    }
  },
  {
    name: 'add_table_enrichment',
    description: 'Add an enrichment to a table with column mapping. The mapping defines how table columns map to enrichment parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        table_uuid: {
          type: 'string',
          description: 'The UUID of the table'
        },
        enrichment_id: {
          type: 'number',
          description: 'The enrichment ID to add'
        },
        mapping: {
          type: 'object',
          description: 'Parameter-to-column mapping. Each key is a param name, value is {value: "column_name", type: "mapping"} or {value: "literal", type: "simple"}',
          additionalProperties: true
        }
      },
      required: ['table_uuid', 'enrichment_id', 'mapping']
    }
  },
  {
    name: 'run_table_enrichment',
    description: 'Trigger an enrichment to run on all rows in a table. Use get_table_enrichments first to find enrichment IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        table_uuid: {
          type: 'string',
          description: 'The UUID of the table'
        },
        enrichment_id: {
          type: 'string',
          description: 'The ID of the table enrichment to run'
        }
      },
      required: ['table_uuid', 'enrichment_id']
    }
  },

  // --- User tools ---
  {
    name: 'get_user_balance',
    description: 'Get the current user\'s credit balance and account information. Useful for checking if there are enough credits before running expensive enrichments.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  { name: 'databar-mcp-server', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      // ----------------------------------------------------------------
      // Enrichment handlers
      // ----------------------------------------------------------------

      case 'search_enrichments': {
        const { query, category, limit = 10 } = args as {
          query: string;
          category?: EnrichmentCategory;
          limit?: number;
        };

        let enrichments = await getCachedEnrichments();

        if (category) {
          enrichments = filterByCategory(enrichments, category);
        }

        enrichments = searchEnrichments(enrichments, query);
        enrichments = enrichments.slice(0, limit);

        if (enrichments.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No enrichments found matching "${query}". Try a different search term or browse all enrichments.`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${enrichments.length} enrichment(s):\n\n${enrichments.map(formatEnrichmentForDisplay).join('\n\n---\n\n')}`
          }]
        };
      }

      case 'get_enrichment_details': {
        const { enrichment_id } = args as { enrichment_id: number };
        
        const enrichment = await databarClient.getEnrichmentDetails(enrichment_id);
        const categorized = categorizeEnrichment(enrichment);

        const details = {
          id: categorized.id,
          name: categorized.name,
          category: categorized.category,
          description: categorized.description,
          data_source: categorized.data_source,
          price: categorized.price,
          auth_method: categorized.auth_method,
          parameters: categorized.params?.map(p => ({
            name: p.name,
            required: p.is_required,
            type: p.type_field,
            description: p.description
          })),
          response_fields: categorized.response_fields?.map(f => ({
            name: f.name,
            type: f.type_field
          }))
        };

        return {
          content: [{
            type: 'text',
            text: `Enrichment Details:\n\n${formatEnrichmentForDisplay(categorized)}\n\nFull Details:\n${JSON.stringify(details, null, 2)}`
          }]
        };
      }

      case 'run_enrichment': {
        const { enrichment_id, params, skip_cache = false } = args as {
          enrichment_id: number;
          params: Record<string, any>;
          skip_cache?: boolean;
        };

        const enrichment = await databarClient.getEnrichmentDetails(enrichment_id);
        
        const validation = validateParams(enrichment, params);
        if (!validation.valid) {
          return {
            content: [{
              type: 'text',
              text: `Parameter validation failed:\n${validation.errors.join('\n')}`
            }],
            isError: true
          };
        }

        if (!skip_cache) {
          const cachedData = cache.get(enrichment_id, params);
          if (cachedData) {
            return {
              content: [{
                type: 'text',
                text: `Enrichment completed (cached result)\n\nEnrichment: ${enrichment.name}\nCost: ${enrichment.price} credits (not charged — from cache)\n\nResults:\n${formatResults(cachedData)}`
              }]
            };
          }
        }

        const data = await databarClient.runEnrichmentSync(enrichment_id, params);
        cache.set(enrichment_id, params, data);

        return {
          content: [{
            type: 'text',
            text: `Enrichment completed successfully\n\nEnrichment: ${enrichment.name}\nCost: ${enrichment.price} credits\n\nResults:\n${formatResults(data)}`
          }]
        };
      }

      case 'run_bulk_enrichment': {
        const { enrichment_id, params_list } = args as {
          enrichment_id: number;
          params_list: Record<string, any>[];
        };

        const enrichment = await databarClient.getEnrichmentDetails(enrichment_id);
        const data = await databarClient.runBulkEnrichmentSync(enrichment_id, params_list);

        return {
          content: [{
            type: 'text',
            text: `Bulk enrichment completed\n\nEnrichment: ${enrichment.name}\nRecords: ${params_list.length}\nCost: ~${enrichment.price} credits per record\n\nResults:\n${formatResults(data)}`
          }]
        };
      }

      // ----------------------------------------------------------------
      // Waterfall handlers
      // ----------------------------------------------------------------

      case 'search_waterfalls': {
        const { query } = args as { query: string };
        
        const waterfalls = await databarClient.getAllWaterfalls();
        const lowerQuery = query.toLowerCase();
        
        const filtered = waterfalls.filter(w =>
          w.name.toLowerCase().includes(lowerQuery) ||
          w.description.toLowerCase().includes(lowerQuery) ||
          w.identifier.toLowerCase().includes(lowerQuery)
        );

        if (filtered.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No waterfalls found matching "${query}".`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${filtered.length} waterfall(s):\n\n${filtered.map(formatWaterfallForDisplay).join('\n\n---\n\n')}`
          }]
        };
      }

      case 'run_waterfall': {
        const { waterfall_identifier, params, provider_ids, email_verifier } = args as {
          waterfall_identifier: string;
          params: Record<string, any>;
          provider_ids?: number[];
          email_verifier?: number;
        };

        const result = await databarClient.runWaterfallSync(
          waterfall_identifier, params, provider_ids, email_verifier
        );

        if (!result.data || result.data.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Waterfall completed but no data was found from any provider.'
            }]
          };
        }

        const resultData = result.data[0];
        const totalCost = resultData.steps.reduce((sum: number, step) => sum + parseFloat(step.cost), 0);

        return {
          content: [{
            type: 'text',
            text: `Waterfall completed\n\nTotal Cost: ${totalCost.toFixed(2)} credits\n\nProviders Tried:\n${resultData.steps.map(s => `- ${s.provider}: ${s.result} (${s.cost} credits)`).join('\n')}\n\nResults:\n${formatResults(resultData.result)}`
          }]
        };
      }

      case 'run_bulk_waterfall': {
        const { waterfall_identifier, params_list, provider_ids, email_verifier } = args as {
          waterfall_identifier: string;
          params_list: Record<string, any>[];
          provider_ids?: number[];
          email_verifier?: number;
        };

        const data = await databarClient.runBulkWaterfallSync(
          waterfall_identifier, params_list, provider_ids, email_verifier
        );

        return {
          content: [{
            type: 'text',
            text: `Bulk waterfall completed\n\nRecords: ${params_list.length}\n\nResults:\n${formatResults(data)}`
          }]
        };
      }

      // ----------------------------------------------------------------
      // Table handlers
      // ----------------------------------------------------------------

      case 'create_table': {
        const table = await databarClient.createTable();
        return {
          content: [{
            type: 'text',
            text: `Table created successfully\n\n${formatTableForDisplay(table)}`
          }]
        };
      }

      case 'list_tables': {
        const tables = await databarClient.getAllTables();

        if (tables.length === 0) {
          return {
            content: [{ type: 'text', text: 'No tables found in your workspace.' }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${tables.length} table(s):\n\n${tables.map(formatTableForDisplay).join('\n\n---\n\n')}`
          }]
        };
      }

      case 'get_table_columns': {
        const { table_uuid } = args as { table_uuid: string };
        const columns = await databarClient.getTableColumns(table_uuid);

        if (columns.length === 0) {
          return {
            content: [{ type: 'text', text: 'No columns found on this table.' }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Table has ${columns.length} column(s):\n\n${columns.map(formatColumnForDisplay).join('\n')}`
          }]
        };
      }

      case 'get_table_rows': {
        const { table_uuid, page = 1, per_page = 1000 } = args as {
          table_uuid: string;
          page?: number;
          per_page?: number;
        };

        const data = await databarClient.getTableRows(table_uuid, page, per_page);

        return {
          content: [{
            type: 'text',
            text: `Table rows (page ${page}):\n\n${formatResults(data)}`
          }]
        };
      }

      case 'create_rows': {
        const { table_id, records, options } = args as {
          table_id: string;
          records: { fields: Record<string, any> }[];
          options?: any;
        };

        const response = await databarClient.createRows(table_id, { records, options });

        return {
          content: [{
            type: 'text',
            text: `Create rows result:\n\n${formatCreateRowsResponse(response)}`
          }]
        };
      }

      case 'patch_rows': {
        const { table_id, rows, overwrite = true } = args as {
          table_id: string;
          rows: { id: string; fields: Record<string, any> }[];
          overwrite?: boolean;
        };

        const response = await databarClient.patchRows(table_id, { rows, overwrite });

        return {
          content: [{
            type: 'text',
            text: `Patch rows result:\n\n${formatPatchRowsResponse(response)}`
          }]
        };
      }

      case 'upsert_rows': {
        const { table_id, rows } = args as {
          table_id: string;
          rows: { key: Record<string, any>; fields: Record<string, any> }[];
        };

        const response = await databarClient.upsertRows(table_id, { rows });

        return {
          content: [{
            type: 'text',
            text: `Upsert rows result:\n\n${formatUpsertRowsResponse(response)}`
          }]
        };
      }

      case 'get_table_enrichments': {
        const { table_uuid } = args as { table_uuid: string };
        const enrichments = await databarClient.getTableEnrichments(table_uuid);

        if (enrichments.length === 0) {
          return {
            content: [{ type: 'text', text: 'No enrichments configured on this table.' }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Table has ${enrichments.length} enrichment(s):\n\n${enrichments.map(formatTableEnrichmentForDisplay).join('\n')}`
          }]
        };
      }

      case 'add_table_enrichment': {
        const { table_uuid, enrichment_id, mapping } = args as {
          table_uuid: string;
          enrichment_id: number;
          mapping: Record<string, any>;
        };

        const result = await databarClient.addTableEnrichment(table_uuid, {
          enrichment: enrichment_id,
          mapping
        });

        return {
          content: [{
            type: 'text',
            text: `Enrichment added to table successfully\n\n${formatResults(result)}`
          }]
        };
      }

      case 'run_table_enrichment': {
        const { table_uuid, enrichment_id } = args as {
          table_uuid: string;
          enrichment_id: string;
        };

        const result = await databarClient.runTableEnrichment(table_uuid, enrichment_id);

        return {
          content: [{
            type: 'text',
            text: `Table enrichment triggered successfully\n\n${formatResults(result)}`
          }]
        };
      }

      // ----------------------------------------------------------------
      // User handlers
      // ----------------------------------------------------------------

      case 'get_user_balance': {
        const user = await databarClient.getUserInfo();
        
        return {
          content: [{
            type: 'text',
            text: `User Account Information:\n\nName: ${user.first_name || 'N/A'}\nEmail: ${user.email}\nBalance: ${user.balance} credits\nPlan: ${user.plan}`
          }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message || 'Unknown error occurred'}`
      }],
      isError: true
    };
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Databar MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
