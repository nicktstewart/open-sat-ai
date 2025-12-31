"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MapPanelProps {
  tileUrl?: string;
  isLoading: boolean;
}

export default function MapPanel({ tileUrl, isLoading }: MapPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Map View</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[400px] rounded-md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map View</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px] bg-muted rounded-md flex items-center justify-center">
          {tileUrl ? (
            <div className="text-sm text-muted-foreground">
              Map will render here with tile URL
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No map data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
