/**
 * Precipitation Workflow
 * Handles precipitation analysis using CHIRPS (Climate Hazards Group InfraRed Precipitation with Station data)
 */

import { ee } from "@/lib/gee/client";
import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";
import type { WorkflowResult, TimeSeriesPoint } from "./types";

/**
 * Get months between two dates
 */
function getMonthsBetweenDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: string[] = [];

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    const year = current.getFullYear();
    const month = (current.getMonth() + 1).toString().padStart(2, "0");
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Execute precipitation time series workflow
 */
export async function executePrecipitationTimeSeries(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Load CHIRPS daily precipitation data
  const collection = ee
    .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
    .filterBounds(geometry)
    .filterDate(timeRange.start, timeRange.end)
    .select("precipitation");

  // Calculate all months in the date range
  const months = getMonthsBetweenDates(timeRange.start, timeRange.end);
  console.log(
    `[Precipitation Workflow] Processing ${months.length} months from ${timeRange.start} to ${timeRange.end}`
  );

  // Generate time series data for each month
  const monthlyPrecipitation: TimeSeriesPoint[] = [];

  for (const yearMonth of months) {
    try {
      const [year, month] = yearMonth.split("-");
      const startDate = `${year}-${month}-01`;

      // Calculate end date (last day of month)
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      const endDate = `${year}-${month}-${lastDay}`;

      // Filter to this specific month
      const monthlyCollection = collection.filterDate(startDate, endDate);

      // Calculate mean daily precipitation for this month
      const monthlyMean = monthlyCollection.mean();

      const stats = monthlyMean.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 5000, // CHIRPS is ~5.5km resolution
        maxPixels: 1e9,
      });

      // Evaluate the result asynchronously
      const result = await new Promise<any>((resolve, reject) => {
        stats.evaluate((res: any, error?: string) => {
          if (error) {
            reject(new Error(error));
          } else {
            resolve(res);
          }
        });
      });

      console.log(
        `[Precipitation Workflow] Month ${yearMonth} raw result:`,
        JSON.stringify(result)
      );

      const precipValue = result.precipitation;

      // Only add data points that have valid values
      if (
        precipValue !== null &&
        precipValue !== undefined &&
        !isNaN(precipValue)
      ) {
        monthlyPrecipitation.push({
          date: `${yearMonth}-15`, // Use 15th as representative day of month
          value: precipValue, // mm of rainfall
          label: yearMonth,
        });
        console.log(
          `[Precipitation Workflow] ${yearMonth}: Precipitation = ${precipValue.toFixed(
            1
          )}mm`
        );
      } else {
        console.warn(`[Precipitation Workflow] ${yearMonth}: No valid data`);
      }
    } catch (error) {
      console.error(
        `[Precipitation Workflow] Error processing ${yearMonth}:`,
        error
      );
      // Continue with next month even if this one fails
    }
  }

  // If we got no valid data points, throw an error
  if (monthlyPrecipitation.length === 0) {
    throw new Error(
      "No valid precipitation data found for the specified time range and location."
    );
  }

  console.log(
    `[Precipitation Workflow] Successfully generated ${monthlyPrecipitation.length} data points`
  );

  // Create mean precipitation image for map visualization
  const meanPrecip = collection.mean();

  // Get tile URL for map visualization
  const tileUrl = await new Promise<string>((resolve, reject) => {
    meanPrecip.getMapId(
      {
        min: 0,
        max: 20, // 0-20mm daily precipitation
        palette: ["white", "lightblue", "blue", "darkblue", "purple"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Precipitation Workflow] Map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  return {
    timeSeries: monthlyPrecipitation,
    mapTileUrl: tileUrl,
    attribution: [
      {
        dataset: "CHIRPS Daily",
        source: "Climate Hazards Group, UC Santa Barbara",
        license: "CC BY 4.0",
        citation:
          "Funk et al. (2015). The climate hazards infrared precipitation with stations—a new environmental record for monitoring extremes. Scientific Data 2, 150066.",
      },
    ],
  };
}

/**
 * Execute precipitation change detection workflow
 */
export async function executePrecipitationChange(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Calculate midpoint to split into two periods
  const startDate = new Date(timeRange.start);
  const endDate = new Date(timeRange.end);
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const midDateStr = midDate.toISOString().split("T")[0];

  // Period 1: Before
  const collection1 = ee
    .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
    .filterBounds(geometry)
    .filterDate(timeRange.start, midDateStr)
    .select("precipitation");

  const precip1 = collection1.mean();

  // Period 2: After
  const collection2 = ee
    .ImageCollection("UCSB-CHG/CHIRPS/DAILY")
    .filterBounds(geometry)
    .filterDate(midDateStr, timeRange.end)
    .select("precipitation");

  const precip2 = collection2.mean();

  // Calculate change (absolute difference)
  const precipChange = precip2.subtract(precip1);

  // Get tile URL
  const tileUrl = await new Promise<string>((resolve, reject) => {
    precipChange.getMapId(
      {
        min: -10,
        max: 10,
        palette: ["brown", "white", "blue"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Precipitation Workflow] Change map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  // Calculate mean change
  const changeValue = await new Promise<number>((resolve, reject) => {
    const stats = precipChange.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 5000,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log(
          "[Precipitation Workflow] Change statistics:",
          JSON.stringify(result)
        );
        const change = result.precipitation || 0;
        console.log(
          `[Precipitation Workflow] Calculated precipitation change: ${change.toFixed(
            2
          )}mm/day`
        );
        resolve(change);
      }
    });
  });

  return {
    mapTileUrl: tileUrl,
    changePercent: changeValue, // Using this field for absolute change in mm/day
    attribution: [
      {
        dataset: "CHIRPS Daily",
        source: "Climate Hazards Group, UC Santa Barbara",
        license: "CC BY 4.0",
        citation:
          "Funk et al. (2015). The climate hazards infrared precipitation with stations—a new environmental record for monitoring extremes. Scientific Data 2, 150066.",
      },
    ],
  };
}

/**
 * Main precipitation workflow dispatcher
 */
export async function executePrecipitationWorkflow(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  switch (plan.analysisType) {
    case "timeseries":
    case "seasonal_trend":
    case "single_date_map":
    case "zonal_statistics":
      return executePrecipitationTimeSeries(plan, geometry);

    case "change":
    case "anomaly":
      return executePrecipitationChange(plan, geometry);

    default:
      throw new Error(
        `Unsupported analysis type for precipitation: ${plan.analysisType}`
      );
  }
}
