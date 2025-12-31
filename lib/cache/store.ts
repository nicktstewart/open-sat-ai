import type { AnalysisResult } from "@/lib/schemas/analysis-result";

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

/**
 * In-memory cache store for PoC
 * This is a simple LRU-like cache with TTL support
 *
 * For production, this should be replaced with:
 * - Vercel KV
 * - Redis
 * - Or another distributed cache
 */
class InMemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 100; // Maximum number of entries
  private defaultTTL: number = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > this.defaultTTL) {
      this.cache.delete(key);
      console.log(`[Cache] Expired: ${key}`);
      return null;
    }

    // Increment hit counter
    entry.hits++;

    console.log(
      `[Cache] HIT: ${key} (hits: ${entry.hits}, age: ${Math.round(
        age / 1000
      )}s)`
    );
    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T): void {
    // Enforce size limit by removing oldest entries
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });

    console.log(
      `[Cache] SET: ${key} (size: ${this.cache.size}/${this.maxSize})`
    );
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.defaultTTL) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[Cache] DELETE: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Cache] CLEAR: Removed ${size} entries`);
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // Find the oldest entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(
        `[Cache] EVICTED: ${oldestKey} (age: ${Math.round(
          (Date.now() - oldestTime) / 1000
        )}s)`
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalHits = 0;
    let totalAge = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalAge += Date.now() - entry.timestamp;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits,
      avgHits: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      avgAge: this.cache.size > 0 ? totalAge / this.cache.size / 1000 : 0, // in seconds
    };
  }
}

/**
 * Singleton cache instance
 */
const cache = new InMemoryCache();

/**
 * Cache interface for analysis results
 */
export const analysisCache = {
  get: (key: string): AnalysisResult | null => {
    return cache.get<AnalysisResult>(key);
  },

  set: (key: string, result: AnalysisResult): void => {
    cache.set(key, result);
  },

  has: (key: string): boolean => {
    return cache.has(key);
  },

  delete: (key: string): boolean => {
    return cache.delete(key);
  },
};

/**
 * Cache interface for explanations
 */
export const explanationCache = {
  get: (key: string): string | null => {
    return cache.get<string>(key);
  },

  set: (key: string, explanation: string): void => {
    cache.set(key, explanation);
  },

  has: (key: string): boolean => {
    return cache.has(key);
  },

  delete: (key: string): boolean => {
    return cache.delete(key);
  },
};

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return cache.getStats();
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  cache.clear();
}
