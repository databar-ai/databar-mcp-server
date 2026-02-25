/**
 * Type definitions for Databar API
 */

// ============================================================================
// Enrichment Types
// ============================================================================

export interface EnrichmentParam {
  name: string;
  is_required: boolean;
  type_field: string;
  description: string;
}

export interface EnrichmentResponseField {
  name: string;
  type_field: string;
}

export interface Enrichment {
  id: number;
  name: string;
  description: string;
  data_source: string;
  price: number;
  auth_method: string;
  params?: EnrichmentParam[];
  response_fields?: EnrichmentResponseField[];
}

export interface EnrichmentRunRequest {
  params: Record<string, any>;
}

export interface BulkEnrichmentRunRequest {
  params: Record<string, any>[];
}

export interface EnrichmentRunResponse {
  task_id: string;
  status: string;
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus =
  | 'processing'
  | 'completed'
  | 'success'
  | 'failed'
  | 'error'
  | 'gone';

export interface TaskResponse {
  request_id: string;
  status: TaskStatus;
  data?: any;
  error?: string | string[] | null;
}

// ============================================================================
// Table Types
// ============================================================================

export interface Table {
  identifier: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Column {
  identifier: string;
  internal_name: string;
  name: string;
  type_of_value: string;
  data_processor_id: number | null;
}

export interface TableEnrichment {
  id: string;
  name: string;
}

export interface AddEnrichmentRequest {
  enrichment: number;
  mapping: Record<string, { value: string; type: string }>;
}

// ============================================================================
// Row Types
// ============================================================================

export interface CreateRowsRecord {
  fields: Record<string, any>;
  insert?: { position?: 'TOP' | 'BOTTOM' };
}

export interface CreateRowsDedupeOptions {
  enabled?: boolean;
  keys?: string[];
}

export interface CreateRowsOptions {
  allowNewColumns?: boolean;
  typecast?: boolean;
  dedupe?: CreateRowsDedupeOptions;
}

export interface CreateRowsRequest {
  records: CreateRowsRecord[];
  options?: CreateRowsOptions;
}

export interface CreateRowsCreatedItem {
  rowId: string;
  fields?: Record<string, any>;
}

export interface CreateRowsErrorItem {
  index: number;
  error: { code: string; message: string };
}

export interface CreateRowsResponse {
  created: CreateRowsCreatedItem[];
  errors: CreateRowsErrorItem[];
}

export interface PatchRowOperation {
  id: string;
  fields: Record<string, any>;
}

export interface PatchRowsRequest {
  rows: PatchRowOperation[];
  return_rows?: boolean;
  overwrite?: boolean;
}

export interface PerRowError {
  code: string;
  message: string;
  matches?: number;
}

export interface PatchRowsResultItem {
  id: string;
  ok: boolean;
  row_data?: Record<string, any>;
  error?: PerRowError;
}

export interface PatchRowsResponse {
  results: PatchRowsResultItem[];
}

export interface UpsertRowOperation {
  key: Record<string, any>;
  fields: Record<string, any>;
}

export interface UpsertRowsRequest {
  rows: UpsertRowOperation[];
}

export interface UpsertRowsResultItem {
  index: number;
  match_on: Record<string, any>;
  id: string;
  action: 'created' | 'updated';
  ok: boolean;
  error?: PerRowError;
}

export interface UpsertRowsResponse {
  results: UpsertRowsResultItem[];
}

// ============================================================================
// Waterfall Types
// ============================================================================

export interface WaterfallInputParam {
  name: string;
  type: string;
  required: boolean;
}

export interface WaterfallOutputField {
  name: string;
  label: string;
  type: string;
}

export interface WaterfallEnrichment {
  id: number;
  name: string;
  description: string;
  price: string;
  params: string[];
}

export interface Waterfall {
  identifier: string;
  name: string;
  description: string;
  input_params: WaterfallInputParam[];
  output_fields: WaterfallOutputField[];
  available_enrichments: WaterfallEnrichment[];
  is_email_verifying: boolean;
  email_verifiers: any[];
}

export interface WaterfallRunRequest {
  params: Record<string, any>;
  enrichments: number[];
  email_verifier?: number | null;
}

export interface BulkWaterfallRunRequest {
  params: Record<string, any>[];
  enrichments: number[];
  email_verifier?: number | null;
}

export interface WaterfallStep {
  action: string;
  provider_logo?: string;
  result: string;
  details?: string | null;
  cost: string;
  provider: string;
  is_verified: boolean;
}

export interface WaterfallResultData {
  enrichment_data: Record<string, any>;
  result: Record<string, any>;
  steps: WaterfallStep[];
  result_field: string[];
}

export interface WaterfallTaskResponse {
  request_id: string;
  status: TaskStatus;
  data?: WaterfallResultData[];
  error?: string | null;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  first_name: string | null;
  email: string;
  balance: number;
  plan: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface DatabarErrorDetail {
  type: string;
  loc: string[];
  msg: string;
  input: any;
}

export interface DatabarError {
  detail?: DatabarErrorDetail[] | string;
  error?: string;
  details?: string;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry {
  data: any;
  timestamp: number;
}

// ============================================================================
// Config Types
// ============================================================================

export interface DatabarConfig {
  apiKey: string;
  baseUrl: string;
  cacheTtlHours: number;
  maxPollAttempts: number;
  pollIntervalMs: number;
}

// ============================================================================
// Enrichment Categories (for smart selection)
// ============================================================================

export enum EnrichmentCategory {
  PEOPLE = 'people',
  COMPANY = 'company',
  EMAIL = 'email',
  PHONE = 'phone',
  SOCIAL = 'social',
  FINANCIAL = 'financial',
  VERIFICATION = 'verification',
  OTHER = 'other'
}

export interface CategorizedEnrichment extends Enrichment {
  category: EnrichmentCategory;
  searchKeywords: string[];
}
