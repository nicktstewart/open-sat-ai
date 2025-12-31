"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartPanelProps {
  data?: Array<{ date: string; value: number }>;
  isLoading: boolean;
}

export default function ChartPanel({ data, isLoading }: ChartPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Time Series</CardTitle>
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
        <CardTitle>Time Series</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px] bg-muted rounded-md flex items-center justify-center">
          {data && data.length > 0 ? (
            <div className="text-sm text-muted-foreground">
              Chart will render here with {data.length} data points
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No time series data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
