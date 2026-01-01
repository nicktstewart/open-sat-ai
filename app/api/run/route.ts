import { NextRequest, NextResponse } from "next/server";
import { validateAnalysisPlan } from "@/lib/schemas/analysis-plan";
import {
  validateAnalysisPlan as validateGuardrails,
  logAnalysisRequest,
} from "@/lib/guardrails";
import { generateCacheKey } from "@/lib/cache/key";
import { analysisCache } from "@/lib/cache/store";
import { initializeEarthEngine } from "@/lib/gee/client";
import {
  resolveLocation,
  locationToBBox,
  getLocationName,
} from "@/lib/geo/resolve-location";
import { geocodeLocation, isLocationName } from "@/lib/geo/geocoding";
import { executeNDVIWorkflow } from "@/lib/gee/workflows/ndvi";

/**
 * Execute analysis based on a validated plan
 * This route does NOT use LLM - only deterministic GEE operations
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate the analysis plan
    const body = await request.json();
    const { plan } = body;

    if (!plan) {
      return NextResponse.json(
        { error: "Analysis plan is required" },
        { status: 400 }
      );
    }

    // Validate the plan structure
    let validatedPlan;
    try {
      validatedPlan = validateAnalysisPlan(plan);
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid analysis plan",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 400 }
      );
    }

    // Apply guardrails
    const guardrailsResult = validateGuardrails(validatedPlan);
    if (!guardrailsResult.valid) {
      console.warn(
        "[Run API] Guardrails validation failed:",
        guardrailsResult.error
      );
      return NextResponse.json(
        {
          error: "Request validation failed",
          message: guardrailsResult.error,
          userFriendly: true,
        },
        { status: 400 }
      );
    }

    // Log guardrail warnings if any
    if (guardrailsResult.warnings) {
      console.warn("[Run API] Warnings:", guardrailsResult.warnings);
    }

    // Generate cache key
    const cacheKey = generateCacheKey(validatedPlan);

    // Check cache first
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) {
      console.log("[Run API] Cache hit:", cacheKey);
      return NextResponse.json({
        ...cachedResult,
        metadata: {
          ...cachedResult.metadata,
          cached: true,
          computeTime: Date.now() - startTime,
        },
      });
    }

    console.log("[Run API] Cache miss, executing workflow:", cacheKey);

    // Log the analysis request
    logAnalysisRequest(validatedPlan, {
      cacheKey,
      source: "api/run",
    });

    // Initialize Earth Engine
    try {
      await initializeEarthEngine();
    } catch (error) {
      console.error("Earth Engine initialization failed:", error);
      return NextResponse.json(
        {
          error: "Earth Engine initialization failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Resolve location to geometry
    let geometry;
    let bbox: [number, number, number, number];
    let resolvedLocationName: string;

    try {
      // If location is a string (city name), geocode it first
      if (isLocationName(validatedPlan.location)) {
        console.log(
          `[Run API] Geocoding location: "${validatedPlan.location}"`
        );
        bbox = await geocodeLocation(validatedPlan.location);
        resolvedLocationName = validatedPlan.location;
        console.log(`[Run API] Geocoded to bbox:`, bbox);

        // Convert bbox to Earth Engine geometry
        const ee = await import("@/lib/gee/client").then((m) => m.ee);
        geometry = ee.Geometry.Rectangle([bbox[0], bbox[1], bbox[2], bbox[3]]);
      } else {
        // Location is already a bbox array
        geometry = resolveLocation(validatedPlan.location);
        bbox = locationToBBox(validatedPlan.location);
        resolvedLocationName = getLocationName(validatedPlan.location);
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: "Location resolution failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 400 }
      );
    }

    // Execute the workflow
    let workflowResult;
    try {
      workflowResult = await executeNDVIWorkflow(validatedPlan, geometry);
    } catch (error) {
      console.error("Workflow execution failed:", error);
      return NextResponse.json(
        {
          error: "Analysis execution failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Calculate execution time
    const computeTime = Date.now() - startTime;

    // Build the response
    const timeSeries =
      "timeSeries" in workflowResult ? workflowResult.timeSeries : undefined;
    const changePercent =
      "changePercent" in workflowResult
        ? workflowResult.changePercent
        : undefined;

    // Calculate comprehensive statistics from time series
    let stats: any = { changePercent };

    if (timeSeries && timeSeries.length > 0) {
      const values = timeSeries.map((p: any) => p.value);
      const dates = timeSeries.map((p: any) => p.date);

      // Basic statistics
      const mean =
        values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Find dates for min/max
      const minIndex = values.indexOf(min);
      const maxIndex = values.indexOf(max);
      const minDate = dates[minIndex];
      const maxDate = dates[maxIndex];

      // Standard deviation
      const variance =
        values.reduce(
          (sum: number, v: number) => sum + Math.pow(v - mean, 2),
          0
        ) / values.length;
      const stdDev = Math.sqrt(variance);

      // Trend analysis
      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      const change = lastValue - firstValue;
      const percentChange = (change / firstValue) * 100;

      let trend = "stable";
      if (percentChange > 5) {
        trend = "increasing";
      } else if (percentChange < -5) {
        trend = "decreasing";
      }

      stats = {
        mean,
        min,
        max,
        minDate,
        maxDate,
        stdDev,
        trend: `${trend} (${
          percentChange > 0 ? "+" : ""
        }${percentChange.toFixed(1)}%)`,
        changePercent,
      };
    }

    const result = {
      mapTileUrl: workflowResult.mapTileUrl,
      mapBounds: bbox,
      timeSeries,
      stats,
      attributions: [
        {
          dataset: "Sentinel-2",
          source: "European Space Agency (ESA) / Copernicus",
          license: "CC-BY-SA 3.0 IGO",
          citation: "Contains modified Copernicus Sentinel data [2024]",
          dateRange: `${validatedPlan.timeRange.start} to ${validatedPlan.timeRange.end}`,
        },
      ],
      metadata: {
        analysisType: validatedPlan.analysisType,
        location: resolvedLocationName,
        timeRange: validatedPlan.timeRange,
        computeTime,
        cached: false,
      },
    };

    // Store in cache
    analysisCache.set(cacheKey, result);
    console.log(`[Run API] Analysis completed in ${computeTime}ms`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Run API] Execution error:", error);

    // Provide user-friendly error messages
    let userMessage = "An error occurred while processing your request.";
    let statusCode = 500;

    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes("not registered")) {
        userMessage =
          "Earth Engine service is not properly configured. Please contact support.";
      } else if (error.message.includes("timeout")) {
        userMessage =
          "The analysis is taking too long. Try reducing the time range or area size.";
        statusCode = 504;
      } else if (error.message.includes("quota")) {
        userMessage = "Service quota exceeded. Please try again later.";
        statusCode = 429;
      }
    }

    return NextResponse.json(
      {
        error: "Analysis failed",
        message: userMessage,
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: statusCode }
    );
  }
}
