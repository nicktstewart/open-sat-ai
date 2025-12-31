/**
 * Location resolver for converting named locations or bboxes to GEE geometries
 */

import { ee } from "@/lib/gee/client";
import type { Location } from "@/lib/schemas/analysis-plan";

/**
 * Hardcoded location bounding boxes for PoC
 * Format: [west, south, east, north]
 */
const KNOWN_LOCATIONS: Record<string, [number, number, number, number]> = {
  Tokyo: [139.5, 35.5, 139.9, 35.8],
  Osaka: [135.3, 34.5, 135.7, 34.8],
  Kyoto: [135.6, 34.9, 135.9, 35.1],
  Yokohama: [139.55, 35.35, 139.7, 35.5],
  Nagoya: [136.8, 35.1, 137.0, 35.25],
  Sapporo: [141.25, 43.0, 141.45, 43.15],
  Fukuoka: [130.3, 33.55, 130.5, 33.65],
};

/**
 * Convert a location (name or bbox) to a bounding box array
 */
export function locationToBBox(
  location: Location
): [number, number, number, number] {
  // If location is already a bbox array
  if (Array.isArray(location)) {
    return location as [number, number, number, number];
  }

  // If location is a named location
  const bbox = KNOWN_LOCATIONS[location];
  if (!bbox) {
    throw new Error(
      `Unknown location: "${location}". Supported locations: ${Object.keys(
        KNOWN_LOCATIONS
      ).join(", ")}`
    );
  }

  return bbox;
}

/**
 * Convert a bounding box to an Earth Engine Geometry
 */
export function bboxToGeometry(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;

  // Validate coordinates
  if (west < -180 || west > 180 || east < -180 || east > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (west >= east) {
    throw new Error("West coordinate must be less than east coordinate");
  }
  if (south >= north) {
    throw new Error("South coordinate must be less than north coordinate");
  }

  // Create Earth Engine rectangle geometry
  return ee.Geometry.Rectangle([west, south, east, north]);
}

/**
 * Resolve a Location to an Earth Engine Geometry
 * This is the main entry point for location resolution
 */
export function resolveLocation(location: Location) {
  const bbox = locationToBBox(location);
  return bboxToGeometry(bbox);
}

/**
 * Get a human-readable name for a location
 */
export function getLocationName(location: Location): string {
  if (Array.isArray(location)) {
    return `[${location.join(", ")}]`;
  }
  return location;
}

/**
 * Get all supported location names
 */
export function getSupportedLocations(): string[] {
  return Object.keys(KNOWN_LOCATIONS);
}

/**
 * Calculate the approximate area of a bounding box in square kilometers
 */
export function calculateBBoxArea(
  bbox: [number, number, number, number]
): number {
  const [west, south, east, north] = bbox;

  // Approximate calculation using degrees
  // 1 degree latitude ≈ 111 km
  // 1 degree longitude varies by latitude
  const latDiff = north - south;
  const lonDiff = east - west;
  const avgLat = (north + south) / 2;

  const kmPerDegreeLat = 111;
  const kmPerDegreeLon = 111 * Math.cos((avgLat * Math.PI) / 180);

  const height = latDiff * kmPerDegreeLat;
  const width = lonDiff * kmPerDegreeLon;

  return height * width;
}
