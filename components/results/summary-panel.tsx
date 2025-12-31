"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface SummaryPanelProps {
  summary?: string;
  stats?: Record<string, any>;
  isLoading: boolean;
}

export default function SummaryPanel({
  summary,
  stats,
  isLoading,
}: SummaryPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="w-full h-[100px] rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="w-24 h-6 rounded-md" />
            <Skeleton className="w-24 h-6 rounded-md" />
            <Skeleton className="w-24 h-6 rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <div className="prose prose-sm max-w-none">
            <p className="text-sm text-foreground">{summary}</p>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No summary available
          </div>
        )}

        {stats && Object.keys(stats).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Statistics</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats).map(([key, value]) => (
                <Badge key={key} variant="secondary">
                  {key}: {String(value)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline">Sentinel-2</Badge>
          <Badge variant="outline">Google Earth Engine</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
