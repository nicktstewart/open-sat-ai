import { z } from "zod";

/**
 * Time series data point
 */
export const timeSeriesPointSchema = z.object({
  date: z.string(),
  value: z.number(),
  label: z.string().optional(),
});

/**
 * Summary statistics
 */
export const summaryStatsSchema = z.object({
  mean: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  stdDev: z.number().optional(),
  trend: z.string().optional(),
  changePercent: z.number().optional(),
});

/**
 * Dataset attribution metadata
 */
export const attributionSchema = z.object({
  dataset: z.string(),
  source: z.string(),
  license: z.string().optional(),
  citation: z.string().optional(),
  dateRange: z.string().optional(),
});

/**
 * The complete analysis result schema
 */
export const analysisResultSchema = z.object({
  // Map visualization
  mapTileUrl: z.string().url().optional(),
  mapBounds: z
    .tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ])
    .optional(),

  // Time series data
  timeSeries: z.array(timeSeriesPointSchema).optional(),

  // Summary statistics
  stats: summaryStatsSchema.optional(),

  // Human-readable summary (from LLM)
  summary: z.string().optional(),

  // Data attribution
  attributions: z.array(attributionSchema),

  // Metadata
  metadata: z
    .object({
      analysisType: z.string(),
      location: z.string(),
      timeRange: z.object({
        start: z.string(),
        end: z.string(),
      }),
      computeTime: z.number().optional(),
      cached: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Type inference for TypeScript
 */
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;
export type SummaryStats = z.infer<typeof summaryStatsSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

/**
 * Helper to validate and parse analysis results
 */
export function validateAnalysisResult(data: unknown): AnalysisResult {
  return analysisResultSchema.parse(data);
}

/**
 * Safe validation that returns errors instead of throwing
 */
export function safeValidateAnalysisResult(data: unknown) {
  return analysisResultSchema.safeParse(data);
}

/**
 * Create an empty/default analysis result
 */
export function createEmptyResult(): AnalysisResult {
  return {
    attributions: [],
  };
}
