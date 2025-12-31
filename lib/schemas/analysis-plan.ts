import { z } from "zod";

/**
 * Allowed analysis types - strictly defined for safety
 */
export const analysisTypeEnum = z.enum([
  "ndvi_change",
  "ndvi_timeseries",
  "ndvi_anomaly",
  "seasonal_trend",
]);

/**
 * Allowed datasets - only what we can actually support
 */
export const datasetEnum = z.enum(["sentinel2", "landsat8", "modis"]);

/**
 * Output types we can generate
 */
export const outputEnum = z.enum([
  "map",
  "timeseries",
  "statistics",
  "summary",
]);

/**
 * Time range for analysis
 */
export const timeRangeSchema = z.object({
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

/**
 * Bounding box coordinates [west, south, east, north]
 */
export const bboxSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

/**
 * Location can be either a named location or a bounding box
 */
export const locationSchema = z.union([
  z.string().min(1, "Location name cannot be empty"),
  bboxSchema,
]);

/**
 * The complete analysis plan schema
 * This is what the LLM must produce and what we validate
 */
export const analysisPlanSchema = z.object({
  analysisType: analysisTypeEnum,
  datasets: z
    .array(datasetEnum)
    .min(1, { message: "At least one dataset is required" }),
  timeRange: timeRangeSchema,
  location: locationSchema,
  outputs: z
    .array(outputEnum)
    .min(1, { message: "At least one output type is required" }),
  parameters: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional analysis-specific parameters"),
});

/**
 * Type inference for TypeScript
 */
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;
export type AnalysisType = z.infer<typeof analysisTypeEnum>;
export type Dataset = z.infer<typeof datasetEnum>;
export type OutputType = z.infer<typeof outputEnum>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Location = z.infer<typeof locationSchema>;

/**
 * Helper to validate and parse analysis plans
 */
export function validateAnalysisPlan(data: unknown): AnalysisPlan {
  return analysisPlanSchema.parse(data);
}

/**
 * Safe validation that returns errors instead of throwing
 */
export function safeValidateAnalysisPlan(data: unknown) {
  return analysisPlanSchema.safeParse(data);
}
