/**
 * NDVI Workflow - Core PoC implementation
 * Handles NDVI calculation, time series, and change detection
 */

import { ee } from "@/lib/gee/client";
import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";
import type { TimeSeriesPoint } from "@/lib/schemas/analysis-result";

/**
 * Cloud masking function for Sentinel-2
 */
function maskS2Clouds(image: any) {
  const qa = image.select("QA60");

  // Bits 10 and 11 are clouds and cirrus
  const cloudBitMask = 1 << 10;
  const cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions
  const mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask);
}

/**
 * Calculate NDVI for a single image
 */
function addNDVI(image: any) {
  const ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI");
  return image.addBands(ndvi);
}

/**
 * Calculate months between two dates
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
 * Create monthly composite for a specific year-month
 */
function createMonthlyComposite(
  collection: any,
  geometry: any,
  yearMonth: string
): any {
  const [year, month] = yearMonth.split("-");
  const startDate = `${year}-${month}-01`;

  // Calculate end date (last day of month)
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  const endDate = `${year}-${month}-${lastDay}`;

  // Filter to this specific month
  const monthlyCollection = collection.filterDate(startDate, endDate);

  // Create median composite to reduce noise
  const composite = monthlyCollection.select("NDVI").median();

  return composite;
}

/**
 * Execute NDVI time series workflow
 */
export async function executeNDVITimeSeries(
  plan: AnalysisPlan,
  geometry: any
): Promise<{ timeSeries: TimeSeriesPoint[]; mapTileUrl: string }> {
  const { timeRange } = plan;

  // Load Sentinel-2 collection
  let collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(timeRange.start, timeRange.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20));

  // Apply cloud mask and calculate NDVI
  collection = collection.map(maskS2Clouds).map(addNDVI);

  // Calculate all months in the date range
  const months = getMonthsBetweenDates(timeRange.start, timeRange.end);
  console.log(
    `[NDVI Workflow] Processing ${months.length} months from ${timeRange.start} to ${timeRange.end}`
  );

  // Generate time series data for each month
  const monthlyNDVI: TimeSeriesPoint[] = [];

  for (const yearMonth of months) {
    try {
      const composite = createMonthlyComposite(collection, geometry, yearMonth);

      // Calculate mean NDVI for this month
      const stats = composite.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 100,
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
        `[GEE Response] Month ${yearMonth} raw result:`,
        JSON.stringify(result)
      );
      const ndviValue = result.NDVI;

      // Only add data points that have valid values
      if (ndviValue !== null && ndviValue !== undefined && !isNaN(ndviValue)) {
        monthlyNDVI.push({
          date: `${yearMonth}-15`, // Use 15th as representative day of month
          value: ndviValue,
          label: yearMonth,
        });
        console.log(
          `[NDVI Workflow] ${yearMonth}: NDVI = ${ndviValue.toFixed(4)}`
        );
      } else {
        console.warn(
          `[NDVI Workflow] ${yearMonth}: No valid data (cloudy or no coverage)`
        );
      }
    } catch (error) {
      console.error(`[NDVI Workflow] Error processing ${yearMonth}:`, error);
      // Continue with next month even if this one fails
    }
  }

  // If we got no valid data points, throw an error
  if (monthlyNDVI.length === 0) {
    throw new Error(
      "No valid NDVI data found for the specified time range and location. Try a different date range or location."
    );
  }

  console.log(
    `[NDVI Workflow] Successfully generated ${monthlyNDVI.length} data points`
  );

  // Create mean NDVI image for map visualization (using all available data)
  const meanNDVI = collection.select("NDVI").mean();

  // Get tile URL for map visualization
  const tileUrl = await new Promise<string>((resolve, reject) => {
    meanNDVI.getMapId(
      {
        min: 0,
        max: 1,
        palette: ["brown", "yellow", "green", "darkgreen"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log("[GEE Response] Map tile ID generated:", mapId.urlFormat);
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  return {
    timeSeries: monthlyNDVI,
    mapTileUrl: tileUrl,
  };
}

/**
 * Execute NDVI change detection workflow
 */
export async function executeNDVIChange(
  plan: AnalysisPlan,
  geometry: any
): Promise<{ mapTileUrl: string; changePercent: number }> {
  const { timeRange } = plan;

  // Calculate midpoint to split into two periods
  const startDate = new Date(timeRange.start);
  const endDate = new Date(timeRange.end);
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const midDateStr = midDate.toISOString().split("T")[0];

  // Period 1: Before
  let collection1 = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(timeRange.start, midDateStr)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20));

  collection1 = collection1.map(maskS2Clouds).map(addNDVI);
  const ndvi1 = collection1.select("NDVI").median();

  // Period 2: After
  let collection2 = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(midDateStr, timeRange.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20));

  collection2 = collection2.map(maskS2Clouds).map(addNDVI);
  const ndvi2 = collection2.select("NDVI").median();

  // Calculate change
  const ndviChange = ndvi2.subtract(ndvi1);

  // Get tile URL
  const tileUrl = await new Promise<string>((resolve, reject) => {
    ndviChange.getMapId(
      {
        min: -0.5,
        max: 0.5,
        palette: ["red", "white", "green"],
      },
      (mapId: any, error?: string) => {
        if (error) {
          reject(new Error(error));
        } else {
          console.log(
            "[GEE Response] Change map tile ID generated:",
            mapId.urlFormat
          );
          resolve(mapId.urlFormat);
        }
      }
    );
  });

  // Calculate mean change percentage
  const changePercent = await new Promise<number>((resolve, reject) => {
    const stats = ndviChange.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 100,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        console.log(
          "[GEE Response] Change statistics:",
          JSON.stringify(result)
        );
        const change = result.NDVI || 0;
        console.log(
          `[GEE Response] Calculated change percent: ${(change * 100).toFixed(
            2
          )}%`
        );
        resolve(change * 100); // Convert to percentage
      }
    });
  });

  return {
    mapTileUrl: tileUrl,
    changePercent,
  };
}

/**
 * Main workflow dispatcher
 */
export async function executeNDVIWorkflow(plan: AnalysisPlan, geometry: any) {
  switch (plan.analysisType) {
    case "ndvi_timeseries":
    case "seasonal_trend":
      return executeNDVITimeSeries(plan, geometry);

    case "ndvi_change":
    case "ndvi_anomaly":
      return executeNDVIChange(plan, geometry);

    default:
      throw new Error(`Unsupported analysis type: ${plan.analysisType}`);
  }
}
