import { NextRequest, NextResponse } from "next/server";
import { validateAnalysisPlan } from "@/lib/schemas/analysis-plan";
import { initializeEarthEngine } from "@/lib/gee/client";
import {
  resolveLocation,
  locationToBBox,
  getLocationName,
} from "@/lib/geo/resolve-location";
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
    let bbox;
    try {
      geometry = resolveLocation(validatedPlan.location);
      bbox = locationToBBox(validatedPlan.location);
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

    const result = {
      mapTileUrl: workflowResult.mapTileUrl,
      mapBounds: bbox,
      timeSeries,
      stats: {
        mean: timeSeries
          ? timeSeries.reduce((sum: number, p: any) => sum + p.value, 0) /
            timeSeries.length
          : undefined,
        changePercent,
      },
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
        location: getLocationName(validatedPlan.location),
        timeRange: validatedPlan.timeRange,
        computeTime,
        cached: false,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Execution error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
