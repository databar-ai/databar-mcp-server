/**
 * Simple in-memory cache with TTL support
 */

import { CacheEntry } from './types.js';

export class Cache {
  private cache: Map<string, CacheEntry>;
  private ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.cache = new Map();
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  /**
   * Generate cache key from enrichment ID and parameters
   */
  private generateKey(enrichmentId: number | string, params: Record<string, any>): string {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${enrichmentId}:${sortedParams}`;
  }

  /**
   * Check if cached entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < this.ttlMs;
  }

  /**
   * Get cached data if available and valid
   */
  get(enrichmentId: number | string, params: Record<string, any>): any | null {
    const key = this.generateKey(enrichmentId, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (!this.isValid(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache
   */
  set(enrichmentId: number | string, params: Record<string, any>, data: any): void {
    const key = this.generateKey(enrichmentId, params);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now()
    };
    this.cache.set(key, entry);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; ttlHours: number } {
    return {
      size: this.cache.size,
      ttlHours: this.ttlMs / (60 * 60 * 1000)
    };
  }
}


