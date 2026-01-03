import { createHash } from "crypto";
import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";

/**
 * Generate a deterministic cache key from analysis parameters
 * The key is based on:
 * - AOI (location/geometry)
 * - Time range
 * - Dataset
 * - Analysis type
 */
export function generateCacheKey(plan: AnalysisPlan): string {
  // Normalize the plan to ensure consistent ordering
  const normalizedPlan = {
    analysisType: plan.analysisType,
    datasets: [...plan.datasetIds].sort(),
    timeRange: {
      start: plan.timeRange.start,
      end: plan.timeRange.end,
    },
    location: plan.location,
  };

  // Create a deterministic string representation
  const keyString = JSON.stringify(normalizedPlan);

  // Hash it to create a shorter, fixed-length key
  const hash = createHash("sha256").update(keyString).digest("hex");

  // Use first 16 characters for brevity
  return `analysis:${hash.substring(0, 16)}`;
}

/**
 * Generate a cache key for explanation results
 */
export function generateExplanationCacheKey(
  resultCacheKey: string,
  query: string
): string {
  const combined = `${resultCacheKey}:${query}`;
  const hash = createHash("sha256").update(combined).digest("hex");
  return `explanation:${hash.substring(0, 16)}`;
}

/**
 * Parse cache key to extract metadata (for debugging)
 */
export function parseCacheKey(key: string): {
  type: string;
  hash: string;
} {
  const [type, hash] = key.split(":");
  return { type, hash };
}
