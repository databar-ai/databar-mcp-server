/**
 * Databar API Client with async polling support
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  DatabarConfig,
  Enrichment,
  EnrichmentRunRequest,
  BulkEnrichmentRunRequest,
  EnrichmentRunResponse,
  TaskResponse,
  TaskStatus,
  Table,
  Column,
  TableEnrichment,
  AddEnrichmentRequest,
  CreateRowsRequest,
  CreateRowsResponse,
  PatchRowsRequest,
  PatchRowsResponse,
  UpsertRowsRequest,
  UpsertRowsResponse,
  Waterfall,
  WaterfallRunRequest,
  BulkWaterfallRunRequest,
  WaterfallTaskResponse,
  User,
  DatabarError
} from './types.js';

export class DatabarClient {
  private client: AxiosInstance;
  private config: DatabarConfig;

  constructor(config: DatabarConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'x-apikey': config.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<DatabarError>;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;

      if (status === 401 || status === 403) {
        throw new Error('Invalid API key or insufficient credits. Please check your API key and account balance.');
      }

      if (status === 422) {
        if (data?.detail && Array.isArray(data.detail)) {
          const errors = data.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join(', ');
          throw new Error(`Validation error: ${errors}`);
        }
        throw new Error('Invalid parameters provided');
      }

      if (status === 404) {
        throw new Error('Resource not found');
      }

      if (status === 410) {
        throw new Error('Resource has expired. Data is only stored for 1 hour after task completion.');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      if (data?.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }

      throw new Error(`API error (${status}): ${axiosError.message}`);
    }

    throw new Error(`Unexpected error: ${error.message || 'Unknown error'}`);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw error;
          }
        }

        if (attempt === maxRetries) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  // ============================================================================
  // Enrichment Methods
  // ============================================================================

  async getAllEnrichments(): Promise<Enrichment[]> {
    try {
      const response = await this.withRetry(() => 
        this.client.get<Enrichment[]>('/enrichments')
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getEnrichmentDetails(enrichmentId: number): Promise<Enrichment> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<Enrichment>(`/enrichments/${enrichmentId}`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runEnrichment(
    enrichmentId: number,
    params: Record<string, any>
  ): Promise<EnrichmentRunResponse> {
    try {
      const payload: EnrichmentRunRequest = { params };
      const response = await this.withRetry(() =>
        this.client.post<EnrichmentRunResponse>(
          `/enrichments/${enrichmentId}/run`,
          payload
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runBulkEnrichment(
    enrichmentId: number,
    paramsList: Record<string, any>[]
  ): Promise<EnrichmentRunResponse> {
    try {
      const payload: BulkEnrichmentRunRequest = { params: paramsList };
      const response = await this.withRetry(() =>
        this.client.post<EnrichmentRunResponse>(
          `/enrichments/${enrichmentId}/bulk-run`,
          payload
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTaskStatus(taskId: string): Promise<TaskResponse> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<TaskResponse>(`/tasks/${taskId}`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async pollTaskUntilComplete(taskId: string): Promise<any> {
    const maxAttempts = this.config.maxPollAttempts;
    const pollInterval = this.config.pollIntervalMs;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      const result = await this.getTaskStatus(taskId);
      const status = result.status.toLowerCase();

      if (status === 'completed' || status === 'success') {
        return result.data;
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = Array.isArray(result.error)
          ? result.error.join('; ')
          : result.error;
        throw new Error(errorMsg || 'Task failed');
      }

      if (status === 'gone') {
        throw new Error('Task data has expired. Data is only stored for 1 hour after completion. Please re-run the enrichment.');
      }
    }

    throw new Error(`Task timed out after ${maxAttempts * pollInterval / 1000} seconds`);
  }

  async runEnrichmentSync(
    enrichmentId: number,
    params: Record<string, any>
  ): Promise<any> {
    const runResponse = await this.runEnrichment(enrichmentId, params);
    return await this.pollTaskUntilComplete(runResponse.task_id);
  }

  async runBulkEnrichmentSync(
    enrichmentId: number,
    paramsList: Record<string, any>[]
  ): Promise<any> {
    const runResponse = await this.runBulkEnrichment(enrichmentId, paramsList);
    return await this.pollTaskUntilComplete(runResponse.task_id);
  }

  // ============================================================================
  // Waterfall Methods
  // ============================================================================

  async getAllWaterfalls(): Promise<Waterfall[]> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<Waterfall[]>('/waterfalls')
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getWaterfallDetails(identifier: string): Promise<Waterfall> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<Waterfall>(`/waterfalls/${identifier}`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runWaterfall(
    identifier: string,
    params: Record<string, any>,
    enrichmentIds?: number[],
    emailVerifier?: number
  ): Promise<EnrichmentRunResponse> {
    try {
      if (!enrichmentIds || enrichmentIds.length === 0) {
        const waterfall = await this.getWaterfallDetails(identifier);
        enrichmentIds = waterfall.available_enrichments.map(e => e.id);
      }

      const payload: WaterfallRunRequest = {
        params,
        enrichments: enrichmentIds
      };
      if (emailVerifier != null) {
        payload.email_verifier = emailVerifier;
      }

      const response = await this.withRetry(() =>
        this.client.post<EnrichmentRunResponse>(
          `/waterfalls/${identifier}/run`,
          payload
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runBulkWaterfall(
    identifier: string,
    paramsList: Record<string, any>[],
    enrichmentIds?: number[],
    emailVerifier?: number
  ): Promise<EnrichmentRunResponse> {
    try {
      if (!enrichmentIds || enrichmentIds.length === 0) {
        const waterfall = await this.getWaterfallDetails(identifier);
        enrichmentIds = waterfall.available_enrichments.map(e => e.id);
      }

      const payload: BulkWaterfallRunRequest = {
        params: paramsList,
        enrichments: enrichmentIds
      };
      if (emailVerifier != null) {
        payload.email_verifier = emailVerifier;
      }

      const response = await this.withRetry(() =>
        this.client.post<EnrichmentRunResponse>(
          `/waterfalls/${identifier}/bulk-run`,
          payload
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runWaterfallSync(
    identifier: string,
    params: Record<string, any>,
    enrichmentIds?: number[],
    emailVerifier?: number
  ): Promise<WaterfallTaskResponse> {
    const runResponse = await this.runWaterfall(identifier, params, enrichmentIds, emailVerifier);
    const data = await this.pollTaskUntilComplete(runResponse.task_id);
    
    return {
      request_id: runResponse.task_id,
      status: 'completed',
      data: data,
      error: null
    };
  }

  async runBulkWaterfallSync(
    identifier: string,
    paramsList: Record<string, any>[],
    enrichmentIds?: number[],
    emailVerifier?: number
  ): Promise<any> {
    const runResponse = await this.runBulkWaterfall(identifier, paramsList, enrichmentIds, emailVerifier);
    return await this.pollTaskUntilComplete(runResponse.task_id);
  }

  // ============================================================================
  // Table Methods
  // ============================================================================

  async createTable(): Promise<Table> {
    try {
      const response = await this.withRetry(() =>
        this.client.post<Table>('/table/create')
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllTables(): Promise<Table[]> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<Table[]>('/table/')
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTableColumns(tableUuid: string): Promise<Column[]> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<Column[]>(`/table/${tableUuid}/columns`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTableEnrichments(tableUuid: string): Promise<TableEnrichment[]> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<TableEnrichment[]>(`/table/${tableUuid}/enrichments`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async addTableEnrichment(
    tableUuid: string,
    data: AddEnrichmentRequest
  ): Promise<any> {
    try {
      const response = await this.withRetry(() =>
        this.client.post(`/table/${tableUuid}/add-enrichment`, data)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async runTableEnrichment(
    tableUuid: string,
    enrichmentId: string
  ): Promise<any> {
    try {
      const response = await this.withRetry(() =>
        this.client.get(`/table/${tableUuid}/run-enrichment/${enrichmentId}`)
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTableRows(
    tableUuid: string,
    page: number = 1,
    perPage: number = 1000
  ): Promise<any> {
    try {
      const response = await this.withRetry(() =>
        this.client.get(`/table/${tableUuid}/rows`, {
          params: { page, per_page: perPage }
        })
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async createRows(
    tableId: string,
    request: CreateRowsRequest
  ): Promise<CreateRowsResponse> {
    try {
      const response = await this.withRetry(() =>
        this.client.post<CreateRowsResponse>(
          `/tables/${tableId}/rows`,
          request
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async patchRows(
    tableId: string,
    request: PatchRowsRequest
  ): Promise<PatchRowsResponse> {
    try {
      const response = await this.withRetry(() =>
        this.client.patch<PatchRowsResponse>(
          `/tables/${tableId}/rows`,
          request
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async upsertRows(
    tableId: string,
    request: UpsertRowsRequest
  ): Promise<UpsertRowsResponse> {
    try {
      const response = await this.withRetry(() =>
        this.client.post<UpsertRowsResponse>(
          `/tables/${tableId}/rows:upsert`,
          request
        )
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============================================================================
  // User Methods
  // ============================================================================

  async getUserInfo(): Promise<User> {
    try {
      const response = await this.withRetry(() =>
        this.client.get<User>('/user/me')
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }
}
