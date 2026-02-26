#!/usr/bin/env node

/**
 * Databar MCP Server — stdio entry point.
 * For local usage with Claude Desktop, Cursor, etc.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { createMcpServer } from './mcp-factory.js';
import { loadSpendingConfig } from './guards.js';

dotenv.config();

const API_KEY = process.env.DATABAR_API_KEY;
if (!API_KEY) {
  console.error('Error: DATABAR_API_KEY environment variable is required');
  process.exit(1);
}
const apiKey: string = API_KEY;

const spendingConfig = loadSpendingConfig();

async function main() {
  const server = createMcpServer(apiKey);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Databar MCP Server running on stdio');
  console.error(`Mode: ${spendingConfig.safeMode ? 'safe (balance checked before each run)' : 'unsafe (no balance checks, cost warnings only)'}`);
  console.error(`Spending guard: max_cost_per_request=${spendingConfig.maxCostPerRequest ?? 'unlimited'}, min_balance=${spendingConfig.minBalance}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
