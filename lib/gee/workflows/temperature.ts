/**
 * Temperature Workflow
 * Handles temperature analysis using ERA5 climate reanalysis data
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
 * Execute temperature time series workflow
 */
export async function executeTemperatureTimeSeries(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Select the temperature band (default to mean 2m air temperature)
  const bandName = plan.parameters?.band ?? "mean_2m_air_temperature";

  // Load ERA5 daily collection
  const collection = ee
    .ImageCollection("ECMWF/ERA5/DAILY")
    .filterDate(timeRange.start, timeRange.end)
    .select(bandName);

  // Calculate all months in the date range
  const months = getMonthsBetweenDates(timeRange.start, timeRange.end);
  console.log(
    `[Temperature Workflow] Processing ${months.length} months from ${timeRange.start} to ${timeRange.end}`
  );

  // Generate time series data for each month
  const monthlyTemperature: TimeSeriesPoint[] = [];

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

      // Calculate mean temperature for this month
      const monthlyMean = monthlyCollection.mean();

      const stats = monthlyMean.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 10000, // ERA5 is ~11km resolution, use 10km
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
        `[Temperature Workflow] Month ${yearMonth} raw result:`,
        JSON.stringify(result)
      );

      const tempValue = result[bandName];

      // Convert from Kelvin to Celsius
      if (tempValue !== null && tempValue !== undefined && !isNaN(tempValue)) {
        const tempCelsius = tempValue - 273.15;
        monthlyTemperature.push({
          date: `${yearMonth}-15`, // Use 15th as representative day of month
          value: tempCelsius,
          label: yearMonth,
        });
        console.log(
          `[Temperature Workflow] ${yearMonth}: Temp = ${tempCelsius.toFixed(
            2
          )}°C`
        );
      } else {
        console.warn(`[Temperature Workflow] ${yearMonth}: No valid data`);
      }
    } catch (error) {
      console.error(
        `[Temperature Workflow] Error processing ${yearMonth}:`,
        error
      );
      // Continue with next month even if this one fails
    }
  }

  // If we got no valid data points, throw an error
  if (monthlyTemperature.length === 0) {
    throw new Error(
      "No valid temperature data found for the specified time range and location."
    );
  }

  console.log(
    `[Temperature Workflow] Successfully generated ${monthlyTemperature.length} data points`
  );

  // Create mean temperature image for map visualization
  const meanTemp = collection.mean();

  // Get tile URL for map visualization (convert K to C for visualization)
  const tempCelsius = meanTemp.subtract(ee.Image(273.15));
  const tileUrl = await new Promise<string>((resolve, reject) => {
    tempCelsius.getMapId(
      {
        min: -20,
        max: 40,
        palette: ["blue", "cyan", "yellow", "orange", "red"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Temperature Workflow] Map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  return {
    timeSeries: monthlyTemperature,
    mapTileUrl: tileUrl,
    attribution: [
      {
        dataset: "ERA5 Daily Aggregates",
        source: "ECMWF / Copernicus Climate Change Service",
        license: "Copernicus License",
        citation:
          "Hersbach et al. (2020). ERA5 hourly data on single levels from 1940 to present",
      },
    ],
  };
}

/**
 * Execute temperature change detection workflow
 */
export async function executeTemperatureChange(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;
  const bandName = plan.parameters?.band ?? "mean_2m_air_temperature";

  // Calculate midpoint to split into two periods
  const startDate = new Date(timeRange.start);
  const endDate = new Date(timeRange.end);
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const midDateStr = midDate.toISOString().split("T")[0];

  // Period 1: Before
  const collection1 = ee
    .ImageCollection("ECMWF/ERA5/DAILY")
    .filterDate(timeRange.start, midDateStr)
    .select(bandName);

  const temp1 = collection1.mean();

  // Period 2: After
  const collection2 = ee
    .ImageCollection("ECMWF/ERA5/DAILY")
    .filterDate(midDateStr, timeRange.end)
    .select(bandName);

  const temp2 = collection2.mean();

  // Calculate change (in Kelvin, will convert to Celsius for display)
  const tempChange = temp2.subtract(temp1);

  // Get tile URL
  const tileUrl = await new Promise<string>((resolve, reject) => {
    tempChange.getMapId(
      {
        min: -10,
        max: 10,
        palette: ["blue", "white", "red"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Temperature Workflow] Change map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  // Calculate mean change
  const changeValue = await new Promise<number>((resolve, reject) => {
    const stats = tempChange.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 10000,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log(
          "[Temperature Workflow] Change statistics:",
          JSON.stringify(result)
        );
        const change = result[bandName] || 0;
        console.log(
          `[Temperature Workflow] Calculated temperature change: ${change.toFixed(
            2
          )}°C`
        );
        resolve(change); // Already in Celsius (difference)
      }
    });
  });

  return {
    mapTileUrl: tileUrl,
    changePercent: changeValue, // Use changePercent field for the absolute change value
    attribution: [
      {
        dataset: "ERA5 Daily Aggregates",
        source: "ECMWF / Copernicus Climate Change Service",
        license: "Copernicus License",
        citation:
          "Hersbach et al. (2020). ERA5 hourly data on single levels from 1940 to present",
      },
    ],
  };
}

/**
 * Main temperature workflow dispatcher
 */
export async function executeTemperatureWorkflow(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  switch (plan.analysisType) {
    case "timeseries":
    case "seasonal_trend":
      return executeTemperatureTimeSeries(plan, geometry);

    case "change":
    case "anomaly":
      return executeTemperatureChange(plan, geometry);

    default:
      throw new Error(
        `Unsupported analysis type for temperature: ${plan.analysisType}`
      );
  }
}
