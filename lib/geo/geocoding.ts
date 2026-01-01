/**
 * Geocoding service using OpenStreetMap Nominatim API
 * Converts city/place names to bounding box coordinates
 */

// In-memory cache for geocoding results
const geocodingCache = new Map<string, [number, number, number, number]>();

// Hardcoded fallback locations for common cities (backup if API fails)
const FALLBACK_LOCATIONS: Record<string, [number, number, number, number]> = {
  // North America
  Montreal: [-73.9, 45.4, -73.5, 45.7],
  "New York": [-74.3, 40.6, -73.7, 40.9],
  Toronto: [-79.6, 43.6, -79.1, 43.9],
  Vancouver: [-123.3, 49.2, -122.9, 49.4],
  "Los Angeles": [-118.7, 33.7, -118.1, 34.3],
  Chicago: [-88.0, 41.6, -87.5, 42.0],

  // Europe
  London: [-0.5, 51.3, 0.3, 51.7],
  Paris: [2.2, 48.8, 2.5, 49.0],
  Berlin: [13.2, 52.4, 13.6, 52.6],
  Madrid: [-3.8, 40.3, -3.6, 40.5],
  Rome: [12.4, 41.8, 12.6, 42.0],
  Amsterdam: [4.8, 52.3, 5.0, 52.4],

  // Asia
  Tokyo: [139.5, 35.5, 139.9, 35.8],
  Osaka: [135.3, 34.5, 135.7, 34.8],
  Beijing: [116.2, 39.8, 116.6, 40.1],
  Shanghai: [121.3, 31.1, 121.7, 31.4],
  Seoul: [126.8, 37.4, 127.2, 37.7],
  Mumbai: [72.7, 18.9, 72.9, 19.3],
  Singapore: [103.6, 1.2, 104.0, 1.5],

  // South America
  "São Paulo": [-46.8, -23.7, -46.4, -23.4],
  "Rio de Janeiro": [-43.4, -23.0, -43.1, -22.8],
  "Buenos Aires": [-58.5, -34.7, -58.3, -34.5],

  // Australia
  Sydney: [150.9, -34.0, 151.3, -33.7],
  Melbourne: [144.8, -38.0, 145.1, -37.7],
};

/**
 * Geocode a location name to bounding box coordinates
 * Uses Nominatim API with fallback to hardcoded locations
 */
export async function geocodeLocation(
  locationName: string
): Promise<[number, number, number, number]> {
  // Normalize location name
  const normalizedName = locationName.trim();

  // Check cache first
  const cached = geocodingCache.get(normalizedName);
  if (cached) {
    console.log(`[Geocoding] Cache hit for "${normalizedName}"`);
    return cached;
  }

  // Try Nominatim API first
  try {
    console.log(`[Geocoding] Fetching coordinates for "${normalizedName}"`);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(normalizedName)}` +
        `&format=json` +
        `&limit=1` +
        `&featuretype=city`,
      {
        headers: {
          "User-Agent": "OpenSatAI/1.0", // Nominatim requires User-Agent
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error(`No results found for "${normalizedName}"`);
    }

    const result = data[0];
    const boundingbox = result.boundingbox;

    // Nominatim returns [minlat, maxlat, minlon, maxlon]
    // We need [west, south, east, north] = [minlon, minlat, maxlon, maxlat]
    const bbox: [number, number, number, number] = [
      parseFloat(boundingbox[2]), // west (minlon)
      parseFloat(boundingbox[0]), // south (minlat)
      parseFloat(boundingbox[3]), // east (maxlon)
      parseFloat(boundingbox[1]), // north (maxlat)
    ];

    console.log(`[Geocoding] Successfully geocoded "${normalizedName}":`, bbox);

    // Cache the result
    geocodingCache.set(normalizedName, bbox);

    return bbox;
  } catch (error) {
    console.error(`[Geocoding] API error for "${normalizedName}":`, error);

    // Fall back to hardcoded locations if API fails
    const fallback = FALLBACK_LOCATIONS[normalizedName];
    if (fallback) {
      console.log(
        `[Geocoding] Using fallback location for "${normalizedName}"`
      );
      geocodingCache.set(normalizedName, fallback);
      return fallback;
    }

    // No fallback available
    throw new Error(
      `Unable to find location "${normalizedName}". Please try a different location or provide coordinates as [west, south, east, north].`
    );
  }
}

/**
 * Check if a location is a known location name (string) vs coordinates (array)
 */
export function isLocationName(location: unknown): location is string {
  return typeof location === "string";
}

/**
 * Expand a bounding box by a percentage to add padding
 * Useful for ensuring there's context around the area of interest
 */
export function expandBBox(
  bbox: [number, number, number, number],
  percentExpansion: number = 10
): [number, number, number, number] {
  const [west, south, east, north] = bbox;

  const lonDiff = east - west;
  const latDiff = north - south;

  const lonExpansion = (lonDiff * percentExpansion) / 100 / 2;
  const latExpansion = (latDiff * percentExpansion) / 100 / 2;

  return [
    Math.max(-180, west - lonExpansion),
    Math.max(-90, south - latExpansion),
    Math.min(180, east + lonExpansion),
    Math.min(90, north + latExpansion),
  ];
}
