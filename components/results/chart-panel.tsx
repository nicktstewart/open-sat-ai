"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { TimeSeriesPoint } from "@/lib/schemas/analysis-result";

interface ChartPanelProps {
  data?: TimeSeriesPoint[];
  title?: string;
  loading?: boolean;
}

/**
 * Custom tooltip for the time series chart
 */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-md border bg-background p-3 shadow-md">
      <p className="font-semibold">{data.date}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">NDVI: </span>
        <span className="font-mono">{data.value.toFixed(4)}</span>
      </p>
      {data.label && (
        <p className="text-xs text-muted-foreground">{data.label}</p>
      )}
    </div>
  );
}

export function ChartPanel({ data, title, loading }: ChartPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Time Series Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Time Series Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No time series data available
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate statistics
  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

  // Find points with min/max values
  const minPoint = data.find((d) => d.value === minValue);
  const maxPoint = data.find((d) => d.value === maxValue);

  // Calculate trend
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const trend = lastValue - firstValue;
  const trendPercent = ((trend / firstValue) * 100).toFixed(1);

  // Calculate linear trend line using least squares regression
  const n = data.length;
  const sumX = data.reduce((sum, _, i) => sum + i, 0);
  const sumY = values.reduce((sum, v) => sum + v, 0);
  const sumXY = data.reduce((sum, _, i) => sum + i * values[i], 0);
  const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Generate trend line data
  const trendData = data.map((point, i) => ({
    ...point,
    trend: intercept + slope * i,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Time Series Analysis"}</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline">
            <span className="text-muted-foreground">Avg:</span>{" "}
            {avgValue.toFixed(4)}
          </Badge>
          <Badge variant="outline">
            <span className="text-muted-foreground">Min:</span>{" "}
            {minValue.toFixed(4)}
            {minPoint && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({minPoint.date})
              </span>
            )}
          </Badge>
          <Badge variant="outline">
            <span className="text-muted-foreground">Max:</span>{" "}
            {maxValue.toFixed(4)}
            {maxPoint && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({maxPoint.date})
              </span>
            )}
          </Badge>
          <Badge
            variant={
              trend > 0 ? "default" : trend < 0 ? "destructive" : "secondary"
            }
          >
            <span className="text-muted-foreground">Trend:</span>{" "}
            {trend > 0 ? "+" : ""}
            {trendPercent}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={trendData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              className="text-xs"
              tick={{ fontSize: 12 }}
              domain={[
                (dataMin: number) => Math.floor(dataMin * 100) / 100 - 0.05,
                (dataMax: number) => Math.ceil(dataMax * 100) / 100 + 0.05,
              ]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Average reference line */}
            <ReferenceLine
              y={avgValue}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              label={{
                value: `Avg: ${avgValue.toFixed(4)}`,
                position: "right",
                fontSize: 10,
              }}
            />

            {/* Trend line */}
            <Line
              type="monotone"
              dataKey="trend"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Trend"
              opacity={0.6}
            />

            {/* Main data line with smooth monotone curve */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              name="NDVI"
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>
            <strong>Note:</strong> Each point represents a monthly aggregation.
            Higher NDVI values typically indicate healthier, denser vegetation.
            The dashed line shows the overall trend.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
