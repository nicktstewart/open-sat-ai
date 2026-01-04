/**
 * Air Quality Workflow
 * Handles air quality analysis using Sentinel-5P TROPOMI data
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
 * Execute air quality time series workflow
 */
export async function executeAirQualityTimeSeries(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Use the dataset from the plan, or select based on parameter
  const datasetId = plan.datasetIds[0];

  // Map dataset to band name
  const bandMap: Record<string, string> = {
    "COPERNICUS/S5P/OFFL/L3_NO2": "tropospheric_NO2_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_NO2": "tropospheric_NO2_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_CO": "CO_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_CO": "CO_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_O3": "O3_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_O3": "O3_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_SO2": "SO2_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_SO2": "SO2_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_CH4": "CH4_column_volume_mixing_ratio_dry_air",
    "COPERNICUS/S5P/NRTI/L3_CH4": "CH4_column_volume_mixing_ratio_dry_air",
    "COPERNICUS/S5P/OFFL/L3_HCHO": "tropospheric_HCHO_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_HCHO": "tropospheric_HCHO_column_number_density",
  };

  const bandName = plan.parameters?.band ?? bandMap[datasetId];
  if (!bandName) {
    throw new Error(
      `Unsupported air quality dataset: ${datasetId}. Must be a Sentinel-5P dataset.`
    );
  }

  // Determine parameter name for visualization
  const parameter = datasetId.includes("NO2")
    ? "NO2"
    : datasetId.includes("CO")
    ? "CO"
    : datasetId.includes("O3")
    ? "O3"
    : datasetId.includes("SO2")
    ? "SO2"
    : datasetId.includes("CH4")
    ? "CH4"
    : datasetId.includes("HCHO")
    ? "HCHO"
    : "NO2";

  // Load Sentinel-5P TROPOMI collection
  const collection = ee
    .ImageCollection(datasetId)
    .filterBounds(geometry)
    .filterDate(timeRange.start, timeRange.end)
    .select(bandName);

  // Calculate all months in the date range
  const months = getMonthsBetweenDates(timeRange.start, timeRange.end);
  console.log(
    `[Air Quality Workflow] Processing ${months.length} months from ${timeRange.start} to ${timeRange.end}`
  );

  // Generate time series data for each month
  const monthlyAirQuality: TimeSeriesPoint[] = [];

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

      // Calculate mean for this month
      const monthlyMean = monthlyCollection.mean();

      const stats = monthlyMean.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 1000, // Sentinel-5P is ~7km resolution, use 1km for processing
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
        `[Air Quality Workflow] Month ${yearMonth} raw result:`,
        JSON.stringify(result)
      );

      const value = result[bandName];

      // Only add data points that have valid values
      if (value !== null && value !== undefined && !isNaN(value)) {
        // Convert to more readable units (multiply by appropriate factor)
        const displayValue = parameter === "CH4" ? value : value * 1000000; // mol/m² to µmol/m² (except CH4 which is already in ppb)

        monthlyAirQuality.push({
          date: `${yearMonth}-15`, // Use 15th as representative day of month
          value: displayValue,
          label: yearMonth,
        });
        console.log(
          `[Air Quality Workflow] ${yearMonth}: ${parameter} = ${displayValue.toFixed(
            2
          )}`
        );
      } else {
        console.warn(`[Air Quality Workflow] ${yearMonth}: No valid data`);
      }
    } catch (error) {
      console.error(
        `[Air Quality Workflow] Error processing ${yearMonth}:`,
        error
      );
      // Continue with next month even if this one fails
    }
  }

  // If we got no valid data points, throw an error
  if (monthlyAirQuality.length === 0) {
    throw new Error(
      "No valid air quality data found for the specified time range and location."
    );
  }

  console.log(
    `[Air Quality Workflow] Successfully generated ${monthlyAirQuality.length} data points`
  );

  // Create mean air quality image for map visualization
  const meanAirQuality = collection.mean();

  // Get tile URL for map visualization
  const tileUrl = await new Promise<string>((resolve, reject) => {
    // Define visualization parameters based on parameter type
    const visParams: Record<string, any> = {
      NO2: { min: 0, max: 0.0002, palette: ["blue", "green", "yellow", "red"] },
      CO: { min: 0, max: 0.05, palette: ["blue", "green", "yellow", "red"] },
      O3: { min: 0.12, max: 0.15, palette: ["blue", "green", "yellow", "red"] },
      SO2: { min: 0, max: 0.0005, palette: ["blue", "green", "yellow", "red"] },
      CH4: {
        min: 1750,
        max: 1900,
        palette: ["blue", "green", "yellow", "red"],
      },
      HCHO: {
        min: 0,
        max: 0.0003,
        palette: ["blue", "green", "yellow", "red"],
      },
    };

    meanAirQuality.getMapId(
      visParams[parameter],
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Air Quality Workflow] Map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  return {
    timeSeries: monthlyAirQuality,
    mapTileUrl: tileUrl,
    attribution: [
      {
        dataset: "Sentinel-5P TROPOMI",
        source: "European Space Agency (ESA) / Copernicus",
        license: "CC BY 4.0",
        citation:
          "Contains modified Copernicus Sentinel-5P TROPOMI data [2024]",
      },
    ],
  };
}

/**
 * Execute air quality change detection workflow
 */
export async function executeAirQualityChange(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  const { timeRange } = plan;

  // Use the dataset from the plan
  const datasetId = plan.datasetIds[0];

  // Map dataset to band name
  const bandMap: Record<string, string> = {
    "COPERNICUS/S5P/OFFL/L3_NO2": "tropospheric_NO2_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_NO2": "tropospheric_NO2_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_CO": "CO_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_CO": "CO_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_O3": "O3_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_O3": "O3_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_SO2": "SO2_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_SO2": "SO2_column_number_density",
    "COPERNICUS/S5P/OFFL/L3_CH4": "CH4_column_volume_mixing_ratio_dry_air",
    "COPERNICUS/S5P/NRTI/L3_CH4": "CH4_column_volume_mixing_ratio_dry_air",
    "COPERNICUS/S5P/OFFL/L3_HCHO": "tropospheric_HCHO_column_number_density",
    "COPERNICUS/S5P/NRTI/L3_HCHO": "tropospheric_HCHO_column_number_density",
  };

  const bandName = plan.parameters?.band ?? bandMap[datasetId];
  if (!bandName) {
    throw new Error(
      `Unsupported air quality dataset: ${datasetId}. Must be a Sentinel-5P dataset.`
    );
  }

  // Determine parameter name for visualization
  const parameter = datasetId.includes("NO2")
    ? "NO2"
    : datasetId.includes("CO")
    ? "CO"
    : datasetId.includes("O3")
    ? "O3"
    : datasetId.includes("SO2")
    ? "SO2"
    : datasetId.includes("CH4")
    ? "CH4"
    : datasetId.includes("HCHO")
    ? "HCHO"
    : "NO2";

  // Calculate midpoint to split into two periods
  const startDate = new Date(timeRange.start);
  const endDate = new Date(timeRange.end);
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const midDateStr = midDate.toISOString().split("T")[0];

  // Period 1: Before
  const collection1 = ee
    .ImageCollection(datasetId)
    .filterBounds(geometry)
    .filterDate(timeRange.start, midDateStr)
    .select(bandName);

  const airQuality1 = collection1.mean();

  // Period 2: After
  const collection2 = ee
    .ImageCollection(datasetId)
    .filterBounds(geometry)
    .filterDate(midDateStr, timeRange.end)
    .select(bandName);

  const airQuality2 = collection2.mean();

  // Calculate change
  const airQualityChange = airQuality2.subtract(airQuality1);

  // Get tile URL
  const tileUrl = await new Promise<string>((resolve, reject) => {
    airQualityChange.getMapId(
      {
        min: -0.00005,
        max: 0.00005,
        palette: ["blue", "white", "red"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[Air Quality Workflow] Change map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  // Calculate mean change percentage
  const changeValue = await new Promise<number>((resolve, reject) => {
    const stats = airQualityChange.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 1000,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log(
          "[Air Quality Workflow] Change statistics:",
          JSON.stringify(result)
        );
        const change = result[bandName] || 0;
        const changePercent = (change / result[bandName]) * 100;
        console.log(
          `[Air Quality Workflow] Calculated ${parameter} change: ${changePercent.toFixed(
            2
          )}%`
        );
        resolve(changePercent);
      }
    });
  });

  return {
    mapTileUrl: tileUrl,
    changePercent: changeValue,
    attribution: [
      {
        dataset: "Sentinel-5P TROPOMI",
        source: "European Space Agency (ESA) / Copernicus",
        license: "CC BY 4.0",
        citation:
          "Contains modified Copernicus Sentinel-5P TROPOMI data [2024]",
      },
    ],
  };
}

/**
 * Main air quality workflow dispatcher
 */
export async function executeAirQualityWorkflow(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  switch (plan.analysisType) {
    case "timeseries":
    case "seasonal_trend":
    case "single_date_map":
    case "zonal_statistics":
      return executeAirQualityTimeSeries(plan, geometry);

    case "change":
    case "anomaly":
      return executeAirQualityChange(plan, geometry);

    default:
      throw new Error(
        `Unsupported analysis type for air_quality: ${plan.analysisType}`
      );
  }
}
