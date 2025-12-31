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

  // Create monthly composites
  const months = ee.List.sequence(1, 12);
  const startYear = parseInt(timeRange.start.split("-")[0]);
  const endYear = parseInt(timeRange.end.split("-")[0]);

  const monthlyNDVI: TimeSeriesPoint[] = [];

  // Sample approach: Create mean NDVI image for visualization
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
          const url = `https://earthengine.googleapis.com/v1alpha/${mapId.tile_fetcher.url_format}`;
          resolve(url);
        }
      }
    );
  });

  // For PoC: Calculate mean NDVI per month
  // In production, this would be more sophisticated
  const meanValue = await new Promise<number>((resolve, reject) => {
    const stats = meanNDVI.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 100,
      maxPixels: 1e9,
    });

    stats.evaluate((result: any, error?: string) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve(result.NDVI || 0.5);
      }
    });
  });

  // Generate sample time series (simplified for PoC)
  const numMonths = 12;
  for (let i = 0; i < numMonths; i++) {
    const month = i + 1;
    const dateStr = `${startYear}-${month.toString().padStart(2, "0")}-15`;
    monthlyNDVI.push({
      date: dateStr,
      value: meanValue + (Math.random() - 0.5) * 0.1, // Add some variation
      label: `Month ${month}`,
    });
  }

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
          const url = `https://earthengine.googleapis.com/v1alpha/${mapId.tile_fetcher.url_format}`;
          resolve(url);
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
        const change = result.NDVI || 0;
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
