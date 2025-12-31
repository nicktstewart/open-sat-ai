"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { SummaryStats, Attribution } from "@/lib/schemas/analysis-result";
import {
  Info,
  Database,
  Calendar,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface SummaryPanelProps {
  explanation?: string;
  stats?: SummaryStats;
  attributions?: Attribution[];
  loading?: boolean;
}

/**
 * Format large numbers for display
 */
function formatNumber(num: number, decimals: number = 4): string {
  return num.toFixed(decimals);
}

/**
 * Render individual statistic
 */
function StatItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-3">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

export function SummaryPanel({
  explanation,
  stats,
  attributions,
  loading,
}: SummaryPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData =
    explanation || stats || (attributions && attributions.length > 0);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No summary available
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Analysis Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Explanation */}
        {explanation && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Interpretation</h3>
            <div className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
              {explanation.split("\n\n").map((paragraph, idx) => (
                <p key={idx} className={idx > 0 ? "mt-3" : ""}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Statistics Grid */}
        {stats && (
          <div>
            <h3 className="mb-3 text-sm font-semibold">Key Statistics</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.mean !== undefined && (
                <StatItem label="Mean Value" value={formatNumber(stats.mean)} />
              )}
              {stats.min !== undefined && (
                <div className="col-span-1">
                  <StatItem
                    label="Minimum NDVI"
                    value={formatNumber(stats.min)}
                  />
                  {stats.minDate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      on {stats.minDate}
                    </p>
                  )}
                </div>
              )}
              {stats.max !== undefined && (
                <div className="col-span-1">
                  <StatItem
                    label="Maximum NDVI"
                    value={formatNumber(stats.max)}
                  />
                  {stats.maxDate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      on {stats.maxDate}
                    </p>
                  )}
                </div>
              )}
              {stats.stdDev !== undefined && (
                <StatItem
                  label="Std Deviation"
                  value={formatNumber(stats.stdDev)}
                />
              )}
              {stats.trend && (
                <StatItem
                  label="Overall Trend"
                  value={stats.trend}
                  icon={
                    stats.trend.toLowerCase().includes("increas")
                      ? TrendingUp
                      : stats.trend.toLowerCase().includes("decreas")
                      ? TrendingDown
                      : undefined
                  }
                />
              )}
              {stats.changePercent !== undefined && (
                <StatItem
                  label="Change"
                  value={`${stats.changePercent > 0 ? "+" : ""}${formatNumber(
                    stats.changePercent,
                    2
                  )}%`}
                  icon={
                    stats.changePercent > 0
                      ? TrendingUp
                      : stats.changePercent < 0
                      ? TrendingDown
                      : undefined
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* Data Attribution */}
        {attributions && attributions.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4" />
              Data Sources
            </h3>
            <div className="space-y-3">
              {attributions.map((attr, idx) => (
                <div
                  key={idx}
                  className="rounded-md border bg-card p-3 text-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{attr.dataset}</p>
                      <p className="text-xs text-muted-foreground">
                        {attr.source}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      Satellite Data
                    </Badge>
                  </div>

                  {attr.dateRange && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{attr.dateRange}</span>
                    </div>
                  )}

                  {attr.license && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      License: {attr.license}
                    </p>
                  )}

                  {attr.citation && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Citation
                      </summary>
                      <p className="mt-1 rounded bg-muted p-2 font-mono text-xs">
                        {attr.citation}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Important Notice
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-200">
            This analysis is based on satellite imagery and automated
            interpretation. Results should be validated with ground truth data
            and domain expertise before making decisions. The AI-generated
            explanation represents patterns in the data but does not establish
            causation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
