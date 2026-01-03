import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * New, broader schema (replace your existing analysis-plan schema with this shape)
 */
const AnalysisPlanSchema = z.object({
  analysisType: z.enum([
    "timeseries",
    "change",
    "anomaly",
    "seasonal_trend",
    "single_date_map",
    "zonal_statistics",
  ]),
  dataProduct: z.enum([
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
  ]),
  datasetIds: z.array(z.string().min(3)).min(1), // e.g. ["ECMWF/ERA5/DAILY"], ["COPERNICUS/S2_SR"]
  timeRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  location: z.union([
    z.string(), // "Tokyo"
    z.tuple([z.number(), z.number(), z.number(), z.number()]), // bbox if user gives coords
  ]),
  outputs: z
    .array(z.enum(["map", "timeseries", "statistics", "summary"]))
    .min(1),

  // Optional knobs for the eventual GEE executor
  parameters: z
    .object({
      // indices / derived layers
      index: z
        .enum(["ndvi", "ndwi", "ndbi", "lst", "none"])
        .optional()
        .default("none"),

      // raw band selection for non-index products (ERA5 variables, night lights band, etc.)
      band: z.string().optional(),

      // reducers + scale hints (executor can interpret these)
      reducer: z.enum(["mean", "median", "sum", "min", "max"]).optional(),
      scaleMeters: z.number().int().positive().optional(),

      // cloud filtering (optical)
      maxCloudPercent: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

function getPlannerSystemPrompt(): string {
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentYear = now.getFullYear();

  return `You are a Google Earth Engine (GEE) analysis planner.
Convert user requests into a strict JSON plan.

CURRENT DATE: ${currentDate}
CURRENT YEAR: ${currentYear}

IMPORTANT:
- You are planning analyses that will be executed in Google Earth Engine using dataset IDs from the Earth Engine Data Catalog.
- Pick the BEST datasetId for the request. Use common, stable datasets when possible.
- Output ONLY valid JSON (no markdown, no extra text).

SUPPORTED ANALYSIS TYPES:
- timeseries: value over time for an AOI (default for "trends", "changes over time")
- change: compare two dates/periods (only if user explicitly wants before vs after)
- anomaly: detect unusual deviations
- seasonal_trend: seasonality across >= 1 full year
- single_date_map: map at/around a date
- zonal_statistics: summary stats over a boundary (city/region)

SUPPORTED DATA PRODUCTS (choose one):
- vegetation, water, urban, temperature, precipitation, soil_moisture, elevation,
  landcover, nightlights, population, air_quality, other

DATASET SELECTION GUIDELINES (examples of good defaults):
Vegetation / optical:
- Sentinel-2 surface reflectance: COPERNICUS/S2_SR (2017+ best; earlier exists but SR is typical)
- Landsat 8/9 SR: LANDSAT/LC08/C02/T1_L2 (or Landsat collection 2)

Water:
- Global Surface Water: JRC/GSW1_4/GlobalSurfaceWater

SAR (flooding/roughness, all-weather):
- Sentinel-1 GRD: COPERNICUS/S1_GRD

Temperature / climate:
- ERA5 daily: ECMWF/ERA5/DAILY

Precipitation:
- GPM IMERG: NASA/GPM_L3/IMERG_V07 (or closest stable IMERG collection)
- CHIRPS daily: UCSB-CHG/CHIRPS/DAILY

Elevation:
- SRTM: USGS/SRTMGL1_003

Land cover:
- ESA WorldCover: ESA/WorldCover/v200 (or closest stable)

Night lights:
- VIIRS: NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG

Population:
- WorldPop: WorldPop/GP/100m/pop (pick best matching year)

TIME RULES:
- Dates must be YYYY-MM-DD.
- End date cannot exceed ${currentDate}.
- Start date must be before end date.
- If the user does not specify a range:
  - If they ask about "changes/trends": default to past 3 months.
  - Otherwise default to past 1 month.
- Keep time range <= 5 years unless the user explicitly asks for longer and it is essential; if so, choose a coarser dataset (e.g., MODIS/ERA5) and still keep <= 5 years.

LOCATION RULES:
- Use city/region name string unless user provides a bbox.
- Do not invent coordinates.

OUTPUT SCHEMA:
{
  "analysisType": "timeseries" | "change" | "anomaly" | "seasonal_trend" | "single_date_map" | "zonal_statistics",
  "dataProduct": "vegetation" | "water" | "urban" | "temperature" | "precipitation" | "soil_moisture" | "elevation" | "landcover" | "nightlights" | "population" | "air_quality" | "other",
  "datasetIds": ["GEE/CATALOG/ID"],
  "timeRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "location": "City Name" | [west, south, east, north],
  "outputs": ["map" | "timeseries" | "statistics" | "summary"],
  "parameters": { "index"?: "ndvi"|"ndwi"|"ndbi"|"lst"|"none", "band"?: string, "reducer"?: "mean"|"median"|"sum"|"min"|"max", "scaleMeters"?: number, "maxCloudPercent"?: number }
}

IMPORTANT: datasetIds must be an ARRAY with at least one dataset ID string.

EXAMPLES:
User: "Show rainfall trends in Osaka this year"
-> timeseries, precipitation, datasetIds ["UCSB-CHG/CHIRPS/DAILY"], date ${currentYear}-01-01 to ${currentDate}, outputs ["map","timeseries","summary"], parameters.band set appropriately.

User: "Night lights in Tokyo last year"
-> single_date_map or timeseries, nightlights, datasetIds ["NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG"], timeRange ${
    currentYear - 1
  }-01-01 to ${currentYear - 1}-12-31, outputs ["map","summary"].

Reject:
- Requests unrelated to Earth observation / geospatial/environmental data.`;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required and must be a string" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: getPlannerSystemPrompt() },
          { role: "user", content: query },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return NextResponse.json(
        { error: "Failed to generate analysis plan" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const planText = data.choices[0]?.message?.content;
    if (!planText) {
      return NextResponse.json(
        { error: "No plan generated by LLM" },
        { status: 500 }
      );
    }

    let planJson: unknown;
    try {
      planJson = JSON.parse(planText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON response from LLM" },
        { status: 500 }
      );
    }

    const validation = AnalysisPlanSchema.safeParse(planJson);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid analysis plan", details: validation.error.issues },
        { status: 400 }
      );
    }

    // Date sanity checks (same idea as your current code)
    const plan = validation.data;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const today = new Date(todayStr);
    const start = new Date(plan.timeRange.start);
    const end = new Date(plan.timeRange.end);

    if (end > today) {
      return NextResponse.json(
        {
          error: "Invalid date range",
          message: `End date (${plan.timeRange.end}) cannot be in the future. Current date is ${todayStr}.`,
          userFriendly: true,
        },
        { status: 400 }
      );
    }
    if (start >= end) {
      return NextResponse.json(
        {
          error: "Invalid date range",
          message: "Start date must be before end date.",
          userFriendly: true,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Planning error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
