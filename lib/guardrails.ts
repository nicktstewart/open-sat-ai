import type { AnalysisPlan } from "./schemas/analysis-plan";

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Guardrails configuration
 */
const GUARDRAILS = {
  // Maximum time range in years
  MAX_TIME_RANGE_YEARS: 5,

  // Maximum AOI size (rough approximation in degrees)
  MAX_AOI_SIZE_DEGREES: 10,

  // Allowed analysis types (must match schema exactly)
  ALLOWED_ANALYSIS_TYPES: [
    "ndvi_change",
    "ndvi_timeseries",
    "ndvi_anomaly",
    "seasonal_trend",
  ],

  // Allowed datasets (must match schema exactly)
  ALLOWED_DATASETS: ["sentinel2", "landsat8", "modis"],
};

/**
 * Validate time range is within limits
 */
function validateTimeRange(plan: AnalysisPlan): ValidationResult {
  const start = new Date(plan.timeRange.start);
  const end = new Date(plan.timeRange.end);

  // Check if dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return {
      valid: false,
      error: "Invalid date format. Please use YYYY-MM-DD format.",
    };
  }

  // Check if start is before end
  if (start >= end) {
    return {
      valid: false,
      error: "Start date must be before end date.",
    };
  }

  // Check if time range is reasonable
  const yearsDiff =
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);

  if (yearsDiff > GUARDRAILS.MAX_TIME_RANGE_YEARS) {
    return {
      valid: false,
      error: `Time range too large. Maximum allowed: ${
        GUARDRAILS.MAX_TIME_RANGE_YEARS
      } years. Your request: ${yearsDiff.toFixed(1)} years.`,
    };
  }

  // Check if dates are not in the future
  const now = new Date();
  if (end > now) {
    return {
      valid: false,
      error: "End date cannot be in the future.",
    };
  }

  // Check if dates are not too far in the past (satellite data availability)
  const oldestDate = new Date("2015-01-01"); // Sentinel-2 launch
  if (start < oldestDate) {
    return {
      valid: true,
      warnings: [
        `Start date is before 2015. Some datasets may have limited availability for this period.`,
      ],
    };
  }

  return { valid: true };
}

/**
 * Validate analysis type is supported
 */
function validateAnalysisType(plan: AnalysisPlan): ValidationResult {
  if (!GUARDRAILS.ALLOWED_ANALYSIS_TYPES.includes(plan.analysisType)) {
    return {
      valid: false,
      error: `Unsupported analysis type: "${
        plan.analysisType
      }". Supported types: ${GUARDRAILS.ALLOWED_ANALYSIS_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate datasets are supported
 */
function validateDatasets(plan: AnalysisPlan): ValidationResult {
  const unsupportedDatasets = plan.datasets.filter(
    (ds) => !GUARDRAILS.ALLOWED_DATASETS.includes(ds)
  );

  if (unsupportedDatasets.length > 0) {
    return {
      valid: false,
      error: `Unsupported datasets: ${unsupportedDatasets.join(
        ", "
      )}. Supported datasets: ${GUARDRAILS.ALLOWED_DATASETS.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate location/AOI size
 */
function validateLocation(plan: AnalysisPlan): ValidationResult {
  const location = plan.location;

  // For string locations (named places), we trust the resolver
  if (typeof location === "string") {
    return { valid: true };
  }

  // For bbox, check size
  if (Array.isArray(location) && location.length === 4) {
    const [west, south, east, north] = location;

    // Validate coordinate ranges
    if (west < -180 || west > 180 || east < -180 || east > 180) {
      return {
        valid: false,
        error: "Longitude must be between -180 and 180.",
      };
    }

    if (south < -90 || south > 90 || north < -90 || north > 90) {
      return {
        valid: false,
        error: "Latitude must be between -90 and 90.",
      };
    }

    if (west >= east) {
      return {
        valid: false,
        error: "West longitude must be less than east longitude.",
      };
    }

    if (south >= north) {
      return {
        valid: false,
        error: "South latitude must be less than north latitude.",
      };
    }

    // Calculate size
    const width = east - west;
    const height = north - south;

    if (
      width > GUARDRAILS.MAX_AOI_SIZE_DEGREES ||
      height > GUARDRAILS.MAX_AOI_SIZE_DEGREES
    ) {
      return {
        valid: false,
        error: `Area of interest too large. Maximum: ${
          GUARDRAILS.MAX_AOI_SIZE_DEGREES
        }° x ${GUARDRAILS.MAX_AOI_SIZE_DEGREES}°. Your request: ${width.toFixed(
          2
        )}° x ${height.toFixed(2)}°.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate an analysis plan against all guardrails
 */
export function validateAnalysisPlan(plan: AnalysisPlan): ValidationResult {
  const validations = [
    validateTimeRange(plan),
    validateAnalysisType(plan),
    validateDatasets(plan),
    validateLocation(plan),
  ];

  // Collect all errors and warnings
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const result of validations) {
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
    if (result.warnings) {
      warnings.push(...result.warnings);
    }
  }

  // If any errors, return invalid
  if (errors.length > 0) {
    return {
      valid: false,
      error: errors.join(" "),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Log analysis request for monitoring
 */
export function logAnalysisRequest(plan: AnalysisPlan, metadata?: any) {
  const log = {
    timestamp: new Date().toISOString(),
    analysisType: plan.analysisType,
    datasets: plan.datasets,
    timeRange: plan.timeRange,
    location:
      typeof plan.location === "string"
        ? plan.location
        : `bbox:${plan.location}`,
    ...metadata,
  };

  console.log("[Analysis Request]", JSON.stringify(log, null, 2));
}

/**
 * Get guardrails configuration (for documentation/debugging)
 */
export function getGuardrailsConfig() {
  return { ...GUARDRAILS };
}
