/**
 * Shared workflow types and interfaces
 * This defines the contract all workflows must follow
 */

import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";

/**
 * Attribution information for a dataset
 */
export interface DatasetAttribution {
  dataset: string;
  source: string;
  license?: string;
  citation?: string;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  date: string;
  value: number;
  label?: string;
}

/**
 * Standard result structure that all workflows must return
 */
export interface WorkflowResult {
  // Map visualization (optional)
  mapTileUrl?: string;

  // Time series data (optional)
  timeSeries?: TimeSeriesPoint[];

  // Statistics or summary values (optional)
  stats?: Record<string, number | string>;

  // Change detection value (optional)
  changePercent?: number;

  // Dataset attribution (required - always provide proper attribution)
  attribution: DatasetAttribution[];
}

/**
 * Workflow executor function signature
 * All workflows must conform to this signature
 */
export type WorkflowExecutor = (
  plan: AnalysisPlan,
  geometry: any
) => Promise<WorkflowResult>;
