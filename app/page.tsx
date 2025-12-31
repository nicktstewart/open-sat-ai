"use client";

import { useState } from "react";
import QueryInput from "@/components/query-input";
import { MapPanel } from "@/components/results/map-panel";
import { ChartPanel } from "@/components/results/chart-panel";
import { SummaryPanel } from "@/components/results/summary-panel";

type Status = "idle" | "planning" | "running" | "done" | "error";

interface AnalysisResult {
  mapTileUrl?: string;
  timeSeries?: Array<{ date: string; value: number }>;
  summary?: string;
  stats?: Record<string, any>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (userQuery: string) => {
    setQuery(userQuery);
    setStatus("planning");
    setError(null);
    setResult(null);

    try {
      // Step 1: Call planning API
      const planResponse = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userQuery }),
      });

      if (!planResponse.ok) {
        const errorData = await planResponse.json();
        throw new Error(errorData.error || "Failed to create analysis plan");
      }

      const planData = await planResponse.json();
      console.log("Analysis plan:", planData.plan);

      setStatus("running");

      // Step 2: Execute the analysis using the plan
      const runResponse = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planData.plan }),
      });

      if (!runResponse.ok) {
        const errorData = await runResponse.json();
        throw new Error(errorData.error || "Failed to execute analysis");
      }

      const analysisResult = await runResponse.json();
      console.log("Analysis result:", analysisResult);

      setStatus("done");
      setResult({
        mapTileUrl: analysisResult.mapTileUrl,
        timeSeries: analysisResult.timeSeries,
        summary: `Analysis complete for ${analysisResult.metadata?.location}. Data from ${analysisResult.metadata?.timeRange.start} to ${analysisResult.metadata?.timeRange.end}.`,
        stats: analysisResult.stats,
      });
    } catch (err) {
      console.error("Error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              Satellite Data Explorer
            </h1>
            <p className="text-muted-foreground">
              Ask questions about Earth observation data powered by AI
            </p>
          </div>

          {/* Query Input */}
          <QueryInput
            onSubmit={handleSubmit}
            isLoading={status === "planning" || status === "running"}
          />

          {/* Status Display */}
          {status === "planning" && (
            <div className="text-center text-sm text-muted-foreground">
              Planning analysis...
            </div>
          )}
          {status === "running" && (
            <div className="text-center text-sm text-muted-foreground">
              Running analysis...
            </div>
          )}
          {status === "error" && error && (
            <div className="text-center text-sm text-destructive">
              Error: {error}
            </div>
          )}

          {/* Results Area */}
          {(status === "running" || status === "done" || result) && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MapPanel
                  tileUrl={result?.mapTileUrl}
                  isLoading={status === "running"}
                />
                <ChartPanel
                  data={result?.timeSeries}
                  isLoading={status === "running"}
                />
              </div>
              <SummaryPanel
                summary={result?.summary}
                stats={result?.stats}
                isLoading={status === "running"}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
