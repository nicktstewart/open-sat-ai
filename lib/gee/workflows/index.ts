/**
 * Workflow Router
 * Routes analysis plans to the appropriate workflow executor based on data product
 */

import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";
import type { WorkflowExecutor } from "./types";
import { executeNDVIWorkflow } from "./ndvi";
import { executeTemperatureWorkflow } from "./temperature";
import { executePrecipitationWorkflow } from "./precipitation";
import { executeWaterWorkflow } from "./water";
import { executeAirQualityWorkflow } from "./air_quality";

/**
 * Resolve the appropriate workflow executor for a given analysis plan
 * @param plan - The validated analysis plan
 * @returns The workflow executor function
 * @throws Error if no workflow is implemented for the data product
 */
export function resolveWorkflow(plan: AnalysisPlan): WorkflowExecutor {
  switch (plan.dataProduct) {
    case "vegetation":
      return executeNDVIWorkflow;

    case "temperature":
      return executeTemperatureWorkflow;

    case "precipitation":
      return executePrecipitationWorkflow;

    case "water":
      return executeWaterWorkflow;

    case "air_quality":
      return executeAirQualityWorkflow;

    // Future workflows can be added here:
    // case "nightlights":
    //   return executeNightlightsWorkflow;

    default:
      throw new Error(
        `No workflow implemented for dataProduct="${plan.dataProduct}". ` +
          `Currently supported: vegetation, temperature, precipitation, water, air_quality.`
      );
  }
}

/**
 * Re-export common types for convenience
 */
export type {
  WorkflowExecutor,
  WorkflowResult,
  DatasetAttribution,
} from "./types";
