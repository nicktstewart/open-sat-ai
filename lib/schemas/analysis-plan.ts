import { z } from "zod";

/**
 * Broad analysis types (still strictly controlled)
 */
export const analysisTypeEnum = z.enum([
  "timeseries", // default for trends/changes over time
  "change", // explicit before/after comparison
  "anomaly", // deviations from baseline
  "seasonal_trend", // seasonality (>= 1 year)
  "single_date_map", // map for a date / short window
  "zonal_statistics", // summary stats for an AOI
]);

/**
 * High-level data product category.
 * Helps your executor decide indices/bands/reducers sensibly.
 */
export const dataProductEnum = z.enum([
  "vegetation",
  "water",
  "urban",
  "temperature",
  "precipitation",
  "soil_moisture",
  "elevation",
  "landcover",
  "nightlights",
  "population",
  "air_quality",
  "other",
]);

/**
 * A curated allowlist of real Earth Engine Data Catalog IDs.
 * Add more as you support them.
 *
 * NOTE: These are strings you will use in ee.ImageCollection(...) etc.
 */
export const datasetIdEnum = z.enum([
  // Optical (surface reflectance)
  "COPERNICUS/S2_SR", // Sentinel-2 SR
  "LANDSAT/LC08/C02/T1_L2", // Landsat 8 Collection 2 L2
  "LANDSAT/LC09/C02/T1_L2", // Landsat 9 Collection 2 L2

  // SAR
  "COPERNICUS/S1_GRD", // Sentinel-1 GRD

  // Water
  "JRC/GSW1_4/GlobalSurfaceWater", // Global Surface Water

  // Climate / weather
  "ECMWF/ERA5/DAILY", // ERA5 daily aggregates

  // Precipitation
  "UCSB-CHG/CHIRPS/DAILY", // CHIRPS daily precip

  // Elevation
  "USGS/SRTMGL1_003", // SRTM 30m DEM

  // Land cover
  "ESA/WorldCover/v200", // ESA WorldCover 10m (v2.0)

  // Night lights
  "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG", // VIIRS monthly night lights

  // Population
  "WorldPop/GP/100m/pop", // WorldPop population

  // Air quality (example)
  "COPERNICUS/S5P/OFFL/L3_NO2", // Sentinel-5P NO2
]);

/**
 * Output types you can generate
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
 * Strongly-typed parameters (avoid record<string, unknown> where possible).
 * Keep it optional, but constrain the knobs you will actually support.
 */
export const parametersSchema = z
  .object({
    // Derived indices your executor might compute (optional)
    index: z.enum(["ndvi", "ndwi", "ndbi", "lst", "none"]).optional(),

    // For datasets where a specific band/variable is needed (ERA5, S5P, VIIRS, etc.)
    band: z.string().min(1).optional(),

    // Reducer requested for zonal stats / aggregations
    reducer: z.enum(["mean", "median", "sum", "min", "max"]).optional(),

    // Resolution hint (meters) for reductions/sampling (executor decides final)
    scaleMeters: z.number().int().positive().optional(),

    // Optical cloud filter hint (if supported in executor)
    maxCloudPercent: z.number().min(0).max(100).optional(),
  })
  .strict()
  .optional();

/**
 * The generalized analysis plan schema
 */
export const analysisPlanSchema = z.object({
  analysisType: analysisTypeEnum,
  dataProduct: dataProductEnum,

  // One primary dataset is usually enough; allow an array if you want multi-source fusion.
  // If you *don’t* plan multi-source yet, change to datasetId: datasetIdEnum.
  datasetIds: z.array(datasetIdEnum).min(1, {
    message: "At least one datasetId is required",
  }),

  timeRange: timeRangeSchema,
  location: locationSchema,

  outputs: z.array(outputEnum).min(1, {
    message: "At least one output type is required",
  }),

  parameters: parametersSchema,
});

/**
 * Type inference for TypeScript
 */
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;
export type AnalysisType = z.infer<typeof analysisTypeEnum>;
export type DataProduct = z.infer<typeof dataProductEnum>;
export type DatasetId = z.infer<typeof datasetIdEnum>;
export type OutputType = z.infer<typeof outputEnum>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Location = z.infer<typeof locationSchema>;

export function validateAnalysisPlan(data: unknown): AnalysisPlan {
  return analysisPlanSchema.parse(data);
}

export function safeValidateAnalysisPlan(data: unknown) {
  return analysisPlanSchema.safeParse(data);
}
