import { NextRequest, NextResponse } from "next/server";
import { safeValidateAnalysisPlan } from "@/lib/schemas/analysis-plan";

/**
 * System prompt for the planner LLM
 * This enforces strict output format and allowed operations
 */
function getPlannerSystemPrompt(): string {
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const currentYear = now.getFullYear();

  return `You are a satellite data analysis planner. Your job is to convert user queries into structured analysis plans.

CURRENT DATE: ${currentDate}
CURRENT YEAR: ${currentYear}

ALLOWED ANALYSIS TYPES:
- ndvi_timeseries: Generate time series of vegetation index (DEFAULT - use this for most queries about "changes", "trends", or viewing data "over time")
- ndvi_change: Calculate vegetation change between two periods (ONLY use when explicitly comparing two specific time periods like "before vs after")
- ndvi_anomaly: Detect vegetation anomalies
- seasonal_trend: Analyze seasonal vegetation patterns

ALLOWED DATASETS:
- sentinel2: Sentinel-2 optical imagery (10m resolution) - Available from 2015-06-23 onwards
- landsat8: Landsat 8 optical imagery (30m resolution) - Available from 2013-04-11 onwards
- modis: MODIS moderate resolution imagery (250m-1km) - Available from 2000-02-24 onwards

ALLOWED OUTPUTS:
- map: Spatial visualization
- timeseries: Time series chart
- statistics: Summary statistics
- summary: Text summary

LOCATION FORMAT:
- Use city/region names as strings: "Montreal", "New York", "London", "Tokyo", etc.
- DO NOT try to calculate coordinates yourself
- Examples: "Montreal" (not coordinates), "Paris" (not coordinates)
- Only use bbox arrays [west, south, east, north] if the user explicitly provides coordinates

RULES:
1. Output ONLY valid JSON matching the schema
2. No explanations, no markdown, no extra text
3. Dates must be YYYY-MM-DD format
4. End date CANNOT exceed ${currentDate} (today)
5. Start date must be before end date
6. Time range cannot exceed 5 years
7. DEFAULT to ndvi_timeseries unless user explicitly asks to compare two periods
8. Use city/region names for location, NOT coordinates
9. Calculate relative dates based on current date:
   - "past 3 years" = ${currentYear - 3}-01-01 to ${currentDate}
   - "past year" = ${currentYear - 1}-01-01 to ${currentDate}
   - "past 6 months" = calculate 6 months before ${currentDate}
   - "past 3 months" = calculate 3 months before ${currentDate}
   - "last year" = ${currentYear - 1}-01-01 to ${currentYear - 1}-12-31
   - "this year" = ${currentYear}-01-01 to ${currentDate}
10. If user asks about "changes", "trends", or viewing data over time WITHOUT specifying a time period, DEFAULT to past 3 months
11. If query is unclear, make reasonable assumptions
12. Reject queries about non-vegetation topics
13. For seasonal analysis, ensure full years are covered
14. Sentinel-2 data only available from 2015 onwards

OUTPUT SCHEMA:
{
  "analysisType": "ndvi_timeseries" | "ndvi_change" | "ndvi_anomaly" | "seasonal_trend",
  "datasets": ["sentinel2" | "landsat8" | "modis"],
  "timeRange": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "location": "City Name" | [west, south, east, north],
  "outputs": ["map" | "timeseries" | "statistics" | "summary"],
  "parameters": {} // optional
}

EXAMPLES:
Query: "Show vegetation changes in Montreal in the past year"
Output: {"analysisType": "ndvi_timeseries", "datasets": ["sentinel2"], "timeRange": {"start": "${
    currentYear - 1
  }-01-01", "end": "${currentDate}"}, "location": "Montreal", "outputs": ["map", "timeseries", "summary"]}

Query: "Compare vegetation before and after fire in California"
Output: {"analysisType": "ndvi_change", ...}`;
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

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: getPlannerSystemPrompt(),
          },
          {
            role: "user",
            content: query,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 500,
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

    console.log("[Plan API] ===== LLM OUTPUT START =====");
    console.log(`[Plan API] Model: ${data.model || "gpt-4o"}`);
    console.log(`[Plan API] Tokens used: ${data.usage?.total_tokens || "N/A"}`);
    console.log("[Plan API] Raw response:");
    console.log(planText);
    console.log("[Plan API] ===== LLM OUTPUT END =====");

    if (!planText) {
      return NextResponse.json(
        { error: "No plan generated by LLM" },
        { status: 500 }
      );
    }

    // Parse and validate the plan
    let planData;
    try {
      planData = JSON.parse(planText);
    } catch (e) {
      console.error("Failed to parse LLM response as JSON:", planText);
      return NextResponse.json(
        { error: "Invalid JSON response from LLM" },
        { status: 500 }
      );
    }

    // Validate against schema
    const validation = safeValidateAnalysisPlan(planData);

    if (!validation.success) {
      console.error("Plan validation failed:", validation.error);
      return NextResponse.json(
        {
          error: "Invalid analysis plan",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    // Additional date validation
    const plan = validation.data;
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const startDate = new Date(plan.timeRange.start);
    const endDate = new Date(plan.timeRange.end);
    const todayDate = new Date(currentDate);

    // Validate dates don't exceed current date
    if (endDate > todayDate) {
      return NextResponse.json(
        {
          error: "Invalid date range",
          message: `End date (${plan.timeRange.end}) cannot be in the future. Current date is ${currentDate}.`,
          userFriendly: true,
        },
        { status: 400 }
      );
    }

    // Validate start date is before end date
    if (startDate >= endDate) {
      return NextResponse.json(
        {
          error: "Invalid date range",
          message: "Start date must be before end date.",
          userFriendly: true,
        },
        { status: 400 }
      );
    }

    // Validate Sentinel-2 availability (from 2015-06-23)
    if (plan.datasets.includes("sentinel2")) {
      const sentinel2Start = new Date("2015-06-23");
      if (startDate < sentinel2Start) {
        console.warn(
          `Sentinel-2 data not available before 2015-06-23. Start date: ${plan.timeRange.start}`
        );
      }
    }

    // Return validated plan
    return NextResponse.json({
      plan: validation.data,
      raw: planData, // For debugging
    });
  } catch (error) {
    console.error("Planning error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
