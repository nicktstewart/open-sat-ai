"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MapPanelProps {
  tileUrl?: string;
  bounds?: [number, number, number, number]; // [west, south, east, north]
  loading?: boolean;
}

/**
 * NDVI color ramp for vegetation visualization
 * Low NDVI (bare soil/water) = brown/blue
 * High NDVI (dense vegetation) = green
 */
const NDVI_COLOR_RAMP = [
  "interpolate",
  ["linear"],
  ["raster-value"],
  -0.2,
  "#0000ff", // Water (blue)
  0.0,
  "#8B4513", // Bare soil (brown)
  0.2,
  "#FFFF00", // Sparse vegetation (yellow)
  0.4,
  "#90EE90", // Moderate vegetation (light green)
  0.6,
  "#32CD32", // Healthy vegetation (green)
  0.8,
  "#006400", // Dense vegetation (dark green)
];

export function MapPanel({ tileUrl, bounds, loading }: MapPanelProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return; // Initialize map only once

    try {
      // Initialize MapLibre GL map
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [139.767, 35.681], // Default to Tokyo
        zoom: 10,
      });

      // Add navigation controls
      map.current.addControl(new maplibregl.NavigationControl(), "top-right");

      // Add scale control
      map.current.addControl(
        new maplibregl.ScaleControl({
          maxWidth: 100,
          unit: "metric",
        }),
        "bottom-left"
      );

      console.log("[MapPanel] Map initialized");
    } catch (error) {
      console.error("[MapPanel] Initialization error:", error);
      setMapError("Failed to initialize map");
    }

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map when tile URL or bounds change
  useEffect(() => {
    if (!map.current || !tileUrl) return;

    try {
      // Remove existing GEE layer if present
      if (map.current.getLayer("gee-layer")) {
        map.current.removeLayer("gee-layer");
      }
      if (map.current.getSource("gee-tiles")) {
        map.current.removeSource("gee-tiles");
      }

      // Add GEE tile source
      map.current.addSource("gee-tiles", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
      });

      // Add GEE layer with NDVI color ramp
      map.current.addLayer({
        id: "gee-layer",
        type: "raster",
        source: "gee-tiles",
        paint: {
          "raster-opacity": 0.8,
        },
      });

      console.log("[MapPanel] GEE layer added:", tileUrl);

      // Fit to bounds if provided
      if (bounds && bounds.length === 4) {
        const [west, south, east, north] = bounds;
        map.current.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding: 50,
            duration: 1000,
          }
        );
        console.log("[MapPanel] Fitted to bounds:", bounds);
      }
    } catch (error) {
      console.error("[MapPanel] Error updating layer:", error);
      setMapError("Failed to load satellite data on map");
    }
  }, [tileUrl, bounds]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Map View</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map View</CardTitle>
        {tileUrl && (
          <p className="text-sm text-muted-foreground">
            Satellite data overlay • Pan and zoom to explore
          </p>
        )}
      </CardHeader>
      <CardContent>
        {mapError && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {mapError}
          </div>
        )}
        <div
          ref={mapContainer}
          className="h-[400px] w-full rounded-md border"
          style={{ minHeight: "400px" }}
        />
        {!tileUrl && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <p className="text-sm text-muted-foreground">
              No map data available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
