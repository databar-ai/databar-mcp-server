/**
 * Utility functions for enrichment categorization and formatting
 */

import {
  Enrichment,
  EnrichmentCategory,
  CategorizedEnrichment,
  Table,
  Column,
  TableEnrichment,
  CreateRowsResponse,
  PatchRowsResponse,
  UpsertRowsResponse
} from './types.js';

/**
 * Categorize an enrichment based on its name and description
 */
export function categorizeEnrichment(enrichment: Enrichment): CategorizedEnrichment {
  const text = `${enrichment.name} ${enrichment.description}`.toLowerCase();
  
  let category = EnrichmentCategory.OTHER;
  const searchKeywords: string[] = [];

  if (
    text.includes('linkedin') ||
    text.includes('person') ||
    text.includes('people') ||
    text.includes('profile') ||
    text.includes('contact') ||
    text.includes('name')
  ) {
    category = EnrichmentCategory.PEOPLE;
    searchKeywords.push('linkedin', 'profile', 'person', 'people', 'contact', 'name');
  }
  
  else if (
    text.includes('company') ||
    text.includes('business') ||
    text.includes('organization') ||
    text.includes('domain') ||
    text.includes('technograph') ||
    text.includes('funding')
  ) {
    category = EnrichmentCategory.COMPANY;
    searchKeywords.push('company', 'business', 'organization', 'domain', 'technographics', 'funding');
  }
  
  else if (
    text.includes('email') && 
    (text.includes('find') || text.includes('search') || text.includes('get'))
  ) {
    category = EnrichmentCategory.EMAIL;
    searchKeywords.push('email', 'find email', 'get email', 'email finder');
  }
  
  else if (
    text.includes('email') &&
    (text.includes('verif') || text.includes('valid') || text.includes('check'))
  ) {
    category = EnrichmentCategory.VERIFICATION;
    searchKeywords.push('email', 'verify', 'validate', 'verification', 'validation');
  }
  
  else if (
    text.includes('phone') ||
    text.includes('mobile') ||
    text.includes('telephone')
  ) {
    category = EnrichmentCategory.PHONE;
    searchKeywords.push('phone', 'mobile', 'telephone', 'number');
  }
  
  else if (
    text.includes('twitter') ||
    text.includes('instagram') ||
    text.includes('facebook') ||
    text.includes('social')
  ) {
    category = EnrichmentCategory.SOCIAL;
    searchKeywords.push('social', 'twitter', 'instagram', 'facebook', 'social media');
  }
  
  else if (
    text.includes('stock') ||
    text.includes('financial') ||
    text.includes('revenue') ||
    text.includes('funding') ||
    text.includes('price')
  ) {
    category = EnrichmentCategory.FINANCIAL;
    searchKeywords.push('stock', 'financial', 'revenue', 'funding', 'finance');
  }

  return {
    ...enrichment,
    category,
    searchKeywords
  };
}

/**
 * Search enrichments by query string
 */
export function searchEnrichments(
  enrichments: CategorizedEnrichment[],
  query: string
): CategorizedEnrichment[] {
  const lowerQuery = query.toLowerCase();
  
  return enrichments.filter(enrichment => {
    if (enrichment.name.toLowerCase().includes(lowerQuery)) return true;
    if (enrichment.description.toLowerCase().includes(lowerQuery)) return true;
    if (enrichment.data_source.toLowerCase().includes(lowerQuery)) return true;
    if (enrichment.searchKeywords.some(keyword => keyword.includes(lowerQuery))) return true;
    if (enrichment.category.toLowerCase().includes(lowerQuery)) return true;
    return false;
  });
}

/**
 * Filter enrichments by category
 */
export function filterByCategory(
  enrichments: CategorizedEnrichment[],
  category: EnrichmentCategory
): CategorizedEnrichment[] {
  return enrichments.filter(e => e.category === category);
}

/**
 * Format enrichment for display
 */
export function formatEnrichmentForDisplay(enrichment: CategorizedEnrichment): string {
  return [
    `ID: ${enrichment.id}`,
    `Name: ${enrichment.name}`,
    `Category: ${enrichment.category}`,
    `Description: ${enrichment.description}`,
    `Data Source: ${enrichment.data_source}`,
    `Price: ${enrichment.price} credits`,
    enrichment.params ? `Required Parameters: ${enrichment.params.filter(p => p.is_required).map(p => p.name).join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

/**
 * Format waterfall for display
 */
export function formatWaterfallForDisplay(waterfall: any): string {
  return [
    `Identifier: ${waterfall.identifier}`,
    `Name: ${waterfall.name}`,
    `Description: ${waterfall.description}`,
    `Required Parameters: ${waterfall.input_params.filter((p: any) => p.required).map((p: any) => p.name).join(', ')}`,
    `Available Providers: ${waterfall.available_enrichments.length}`
  ].join('\n');
}

/**
 * Format generic results for display
 */
export function formatResults(data: any): string {
  if (!data) return 'No data returned';
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

/**
 * Extract required parameter names from an enrichment
 */
export function getRequiredParams(enrichment: Enrichment): string[] {
  if (!enrichment.params) return [];
  return enrichment.params
    .filter(p => p.is_required)
    .map(p => p.name);
}

/**
 * Validate parameters against enrichment requirements
 */
export function validateParams(
  enrichment: Enrichment,
  providedParams: Record<string, any>
): { valid: boolean; missing: string[]; errors: string[] } {
  const errors: string[] = [];
  const missing: string[] = [];

  if (!enrichment.params) {
    return { valid: true, missing: [], errors: [] };
  }

  for (const param of enrichment.params) {
    if (param.is_required && !providedParams[param.name]) {
      missing.push(param.name);
      errors.push(`Missing required parameter: ${param.name}`);
    }
  }

  return { valid: missing.length === 0, missing, errors };
}

/**
 * Format table for display
 */
export function formatTableForDisplay(table: Table): string {
  return [
    `UUID: ${table.identifier}`,
    `Name: ${table.name}`,
    `Created: ${table.created_at}`,
    `Updated: ${table.updated_at}`
  ].join('\n');
}

/**
 * Format column for display
 */
export function formatColumnForDisplay(column: Column): string {
  return `${column.name} (${column.type_of_value}) [${column.identifier}]`;
}

/**
 * Format table enrichment for display
 */
export function formatTableEnrichmentForDisplay(enrichment: TableEnrichment): string {
  return `ID: ${enrichment.id} — ${enrichment.name}`;
}

/**
 * Format create-rows response for display
 */
export function formatCreateRowsResponse(response: CreateRowsResponse): string {
  const lines: string[] = [];
  lines.push(`Created: ${response.created?.length ?? 0} row(s)`);
  if (response.created?.length) {
    for (const item of response.created) {
      lines.push(`  - ${item.rowId}`);
    }
  }
  if (response.errors?.length) {
    lines.push(`Errors: ${response.errors.length}`);
    for (const err of response.errors) {
      lines.push(`  - Index ${err.index}: ${err.error.code} — ${err.error.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format patch-rows response for display
 */
export function formatPatchRowsResponse(response: PatchRowsResponse): string {
  const ok = response.results?.filter(r => r.ok).length ?? 0;
  const failed = response.results?.filter(r => !r.ok).length ?? 0;
  const lines: string[] = [`Updated: ${ok}, Failed: ${failed}`];
  if (failed > 0) {
    for (const item of response.results.filter(r => !r.ok)) {
      lines.push(`  - Row ${item.id}: ${item.error?.code} — ${item.error?.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format upsert-rows response for display
 */
export function formatUpsertRowsResponse(response: UpsertRowsResponse): string {
  const created = response.results?.filter(r => r.action === 'created').length ?? 0;
  const updated = response.results?.filter(r => r.action === 'updated').length ?? 0;
  const failed = response.results?.filter(r => !r.ok).length ?? 0;
  const lines: string[] = [`Created: ${created}, Updated: ${updated}, Failed: ${failed}`];
  if (failed > 0) {
    for (const item of response.results.filter(r => !r.ok)) {
      lines.push(`  - Index ${item.index}: ${item.error?.code} — ${item.error?.message}`);
    }
  }
  return lines.join('\n');
}
