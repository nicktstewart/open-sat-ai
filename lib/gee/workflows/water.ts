/**
 * Water Workflow
 * Handles water body analysis using JRC Global Surface Water dataset
 */

import { ee } from "@/lib/gee/client";
import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";
import type { WorkflowResult, TimeSeriesPoint } from "./types";

/**
 * Get years between two dates
 */
function getYearsBetweenDates(startDate: string, endDate: string): number[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const years: number[] = [];

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    years.push(year);
  }

  return years;
}

/**
 * Execute water time series workflow
 */
export async function executeWaterTimeSeries(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Load JRC Yearly Water Classification History
  const collection = ee
    .ImageCollection("JRC/GSW1_4/YearlyHistory")
    .filterDate(timeRange.start, timeRange.end);

  // Calculate all years in the date range
  const years = getYearsBetweenDates(timeRange.start, timeRange.end);
  console.log(
    `[Water Workflow] Processing ${years.length} years from ${timeRange.start} to ${timeRange.end}`
  );

  // Generate time series data for each year
  const yearlyWater: TimeSeriesPoint[] = [];

  for (const year of years) {
    try {
      // Filter to this specific year
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const yearlyCollection = collection.filterDate(startDate, endDate);

      // Create a binary water mask from the collection
      // Water classification: 2 = permanent water, 3 = seasonal water
      const waterImages = yearlyCollection.map((img: any) =>
        img.eq(2).or(img.eq(3))
      );

      // Get mean water occurrence for the year
      const waterMask = waterImages.mean();

      // Calculate water area as percentage of total area
      const stats = waterMask.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 30, // JRC GSW is 30m resolution
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
        `[Water Workflow] Year ${year} raw result:`,
        JSON.stringify(result)
      );

      const waterValue = result.waterClass;

      // Only add data points that have valid values
      if (
        waterValue !== null &&
        waterValue !== undefined &&
        !isNaN(waterValue)
      ) {
        const waterPercentage = waterValue * 100; // Convert to percentage
        yearlyWater.push({
          date: `${year}-07-01`, // Use mid-year as representative
          value: waterPercentage,
          label: year.toString(),
        });
        console.log(
          `[Water Workflow] ${year}: Water coverage = ${waterPercentage.toFixed(
            2
          )}%`
        );
      } else {
        console.warn(`[Water Workflow] ${year}: No valid data`);
      }
    } catch (error) {
      console.error(`[Water Workflow] Error processing ${year}:`, error);
      // Continue with next year even if this one fails
    }
  }

  // If we got no valid data points, throw an error
  if (yearlyWater.length === 0) {
    throw new Error(
      "No valid water data found for the specified time range and location."
    );
  }

  console.log(
    `[Water Workflow] Successfully generated ${yearlyWater.length} data points`
  );

  // Create water occurrence map for visualization
  const waterOccurrence = ee
    .Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence");

  // Get tile URL for map visualization
  const tileUrl = await new Promise<string>((resolve, reject) => {
    waterOccurrence.getMapId(
      {
        min: 0,
        max: 100,
        palette: ["white", "lightblue", "blue", "darkblue"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Water Workflow] Map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  return {
    timeSeries: yearlyWater,
    mapTileUrl: tileUrl,
    attribution: [
      {
        dataset: "JRC Global Surface Water",
        source: "European Commission Joint Research Centre",
        license: "CC BY 4.0",
        citation:
          "Pekel et al. (2016). High-resolution mapping of global surface water and its long-term changes. Nature 540, 418-422.",
      },
    ],
  };
}

/**
 * Execute water change detection workflow
 */
export async function executeWaterChange(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Calculate midpoint to split into two periods
  const startDate = new Date(timeRange.start);
  const endDate = new Date(timeRange.end);
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const midYear = midDate.getFullYear();

  // Period 1: Before
  const collection1 = ee
    .ImageCollection("JRC/GSW1_4/YearlyHistory")
    .filterDate(timeRange.start, `${midYear}-12-31`);

  const water1 = collection1.map((img: any) => img.eq(2).or(img.eq(3))).mean();

  // Period 2: After
  const collection2 = ee
    .ImageCollection("JRC/GSW1_4/YearlyHistory")
    .filterDate(`${midYear + 1}-01-01`, timeRange.end);

  const water2 = collection2.map((img: any) => img.eq(2).or(img.eq(3))).mean();

  // Calculate change (difference in water occurrence)
  const waterChange = water2.subtract(water1);

  // Get tile URL
  const tileUrl = await new Promise<string>((resolve, reject) => {
    waterChange.getMapId(
      {
        min: -0.5,
        max: 0.5,
        palette: ["brown", "white", "blue"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Water Workflow] Change map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  // Calculate mean change percentage
  const changeValue = await new Promise<number>((resolve, reject) => {
    const stats = waterChange.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 30,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log(
          "[Water Workflow] Change statistics:",
          JSON.stringify(result)
        );
        const change = result.waterClass || 0;
        console.log(
          `[Water Workflow] Calculated water change: ${(change * 100).toFixed(
            2
          )}%`
        );
        resolve(change * 100); // Convert to percentage
      }
    });
  });

  return {
    mapTileUrl: tileUrl,
    changePercent: changeValue,
    attribution: [
      {
        dataset: "JRC Global Surface Water",
        source: "European Commission Joint Research Centre",
        license: "CC BY 4.0",
        citation:
          "Pekel et al. (2016). High-resolution mapping of global surface water and its long-term changes. Nature 540, 418-422.",
      },
    ],
  };
}

/**
 * Main water workflow dispatcher
 */
export async function executeWaterWorkflow(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  switch (plan.analysisType) {
    case "timeseries":
    case "seasonal_trend":
    case "single_date_map":
    case "zonal_statistics":
      return executeWaterTimeSeries(plan, geometry);

    case "change":
    case "anomaly":
      return executeWaterChange(plan, geometry);

    default:
      throw new Error(
        `Unsupported analysis type for water: ${plan.analysisType}`
      );
  }
}
