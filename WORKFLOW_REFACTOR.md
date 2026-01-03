# GEE Workflow Architecture Refactor

## Overview

This document describes the workflow architecture refactor that transforms the executor from an NDVI-only system into a **scalable, data-product-agnostic GEE executor**.

## What Changed

### Before: Hard-coded NDVI workflow

```typescript
import { executeNDVIWorkflow } from "@/lib/gee/workflows/ndvi";
// ...
workflowResult = await executeNDVIWorkflow(validatedPlan, geometry);
```

**Problem**: The executor was locked to NDVI analysis only. Adding new data products (temperature, precipitation, etc.) was impossible without major rewrites.

### After: Dynamic workflow routing

```typescript
import { resolveWorkflow } from "@/lib/gee/workflows";
// ...
const workflow = resolveWorkflow(validatedPlan);
workflowResult = await workflow(validatedPlan, geometry);
```

**Solution**: A thin routing layer that selects the appropriate workflow based on `dataProduct`, enabling unlimited expansion.

---

## Architecture

### 1. Workflow Interface (`lib/gee/workflows/types.ts`)

All workflows must implement this standard contract:

```typescript
export interface WorkflowResult {
  mapTileUrl?: string;
  timeSeries?: TimeSeriesPoint[];
  stats?: Record<string, number | string>;
  changePercent?: number;
  attribution: DatasetAttribution[]; // REQUIRED
}

export type WorkflowExecutor = (
  plan: AnalysisPlan,
  geometry: any
) => Promise<WorkflowResult>;
```

**Key point**: `attribution` is now **required** and comes from the workflow, not hardcoded in the executor.

---

### 2. Workflow Router (`lib/gee/workflows/index.ts`)

Routes data products to their workflows:

```typescript
export function resolveWorkflow(plan: AnalysisPlan): WorkflowExecutor {
  switch (plan.dataProduct) {
    case "vegetation":
      return executeNDVIWorkflow;
    case "temperature":
      return executeTemperatureWorkflow;
    case "precipitation":
      return executePrecipitationWorkflow;
    // Add more here...
    default:
      throw new Error(
        `No workflow implemented for dataProduct="${plan.dataProduct}"`
      );
  }
}
```

---

### 3. Individual Workflows

Each workflow is self-contained and dataset-specific:

#### ✅ NDVI Workflow (`lib/gee/workflows/ndvi.ts`)

- **Dataset**: Sentinel-2 MSI
- **Use case**: Vegetation health, agricultural monitoring
- **Attribution**: Copernicus Sentinel-2

#### ✅ Temperature Workflow (`lib/gee/workflows/temperature.ts`)

- **Dataset**: ERA5 Daily Aggregates
- **Use case**: Climate analysis, temperature trends
- **Attribution**: ECMWF / Copernicus Climate Change Service
- **Units**: Converts Kelvin → Celsius

#### ✅ Precipitation Workflow (`lib/gee/workflows/precipitation.ts`)

- **Dataset**: CHIRPS Daily
- **Use case**: Rainfall analysis, drought monitoring
- **Attribution**: Climate Hazards Group, UC Santa Barbara
- **Units**: mm of precipitation

---

## How GEE is Used

All workflows use **server-side GEE computation** (no LLM involved):

1. **ImageCollection filtering** by date and location
2. **Server-side reducers** (mean, median, sum)
3. **Tile generation** for map visualization
4. **Deterministic execution** with caching
5. **Proper attribution** per dataset

Example from temperature workflow:

```typescript
const collection = ee
  .ImageCollection("ECMWF/ERA5/DAILY")
  .filterDate(timeRange.start, timeRange.end)
  .select("mean_2m_air_temperature");

const stats = monthlyMean.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: geometry,
  scale: 10000,
  maxPixels: 1e9,
});
```

This is **exactly how GEE is meant to be used** — all computation happens on Google's servers.

---

## Supported Workflows

| Data Product    | Workflow            | Dataset                  | Status |
| --------------- | ------------------- | ------------------------ | ------ |
| `vegetation`    | NDVI                | Sentinel-2 MSI           | ✅     |
| `temperature`   | Temperature         | ERA5 Daily               | ✅     |
| `precipitation` | Precipitation       | CHIRPS Daily             | ✅     |
| `water`         | Water extent        | JRC Global Surface Water | 🔲     |
| `nightlights`   | Night lights        | VIIRS DNB                | 🔲     |
| `air_quality`   | NO₂ / pollutants    | Sentinel-5P              | 🔲     |
| `urban`         | Urban expansion     | Landsat / Sentinel       | 🔲     |
| `elevation`     | Elevation / terrain | SRTM                     | 🔲     |
| `landcover`     | Land cover          | ESA WorldCover           | 🔲     |
| `soil_moisture` | Soil moisture       | SMAP / SMOS              | 🔲     |

---

## Adding a New Workflow

### Step 1: Create workflow file

Create `lib/gee/workflows/yourworkflow.ts`:

```typescript
import { ee } from "@/lib/gee/client";
import type { AnalysisPlan } from "@/lib/schemas/analysis-plan";
import type { WorkflowResult } from "./types";

export async function executeYourWorkflow(
  plan: AnalysisPlan,
  geometry: any
): Promise<WorkflowResult> {
  // 1. Load your GEE dataset
  const collection = ee
    .ImageCollection("YOUR/DATASET/ID")
    .filterDate(plan.timeRange.start, plan.timeRange.end)
    .select("your_band");

  // 2. Perform server-side computation
  const stats = collection.mean().reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 1000,
    maxPixels: 1e9,
  });

  // 3. Evaluate results
  const result = await new Promise<any>((resolve, reject) => {
    stats.evaluate((res: any, error?: string) => {
      if (error) reject(new Error(error));
      else resolve(res);
    });
  });

  // 4. Return WorkflowResult with attribution
  return {
    timeSeries: [...],
    mapTileUrl: "...",
    attribution: [
      {
        dataset: "Your Dataset Name",
        source: "Data Provider",
        license: "License Info",
        citation: "Citation",
      },
    ],
  };
}
```

### Step 2: Register in router

Update `lib/gee/workflows/index.ts`:

```typescript
import { executeYourWorkflow } from "./yourworkflow";

export function resolveWorkflow(plan: AnalysisPlan): WorkflowExecutor {
  switch (plan.dataProduct) {
    // ... existing cases ...
    case "your_product":
      return executeYourWorkflow;
    default:
      throw new Error(...);
  }
}
```

### Step 3: Add to schema

Ensure `lib/schemas/analysis-plan.ts` includes your data product:

```typescript
export const dataProductEnum = z.enum([
  // ... existing products ...
  "your_product",
]);

export const datasetIdEnum = z.enum([
  // ... existing datasets ...
  "YOUR/DATASET/ID",
]);
```

**That's it!** The executor automatically supports your new workflow.

---

## Attribution Handling

### Before (wrong)

Attribution was **hardcoded to Sentinel-2** in the executor:

```typescript
attributions: [
  {
    dataset: "Sentinel-2", // WRONG for temperature, precipitation, etc.
    source: "European Space Agency (ESA) / Copernicus",
  },
];
```

### After (correct)

Attribution comes **from the workflow**:

```typescript
attributions: workflowResult.attribution.map((attr) => ({
  ...attr,
  dateRange: `${validatedPlan.timeRange.start} to ${validatedPlan.timeRange.end}`,
}));
```

Now each workflow provides accurate attribution for its dataset.

---

## Testing

### Test NDVI (vegetation)

```json
{
  "plan": {
    "analysisType": "timeseries",
    "dataProduct": "vegetation",
    "datasetIds": ["COPERNICUS/S2_SR"],
    "timeRange": { "start": "2023-01-01", "end": "2023-12-31" },
    "location": "Sacramento, California",
    "outputs": ["map", "timeseries"]
  }
}
```

### Test Temperature

```json
{
  "plan": {
    "analysisType": "timeseries",
    "dataProduct": "temperature",
    "datasetIds": ["ECMWF/ERA5/DAILY"],
    "timeRange": { "start": "2023-01-01", "end": "2023-12-31" },
    "location": "Paris, France",
    "outputs": ["map", "timeseries"]
  }
}
```

### Test Precipitation

```json
{
  "plan": {
    "analysisType": "timeseries",
    "dataProduct": "precipitation",
    "datasetIds": ["UCSB-CHG/CHIRPS/DAILY"],
    "timeRange": { "start": "2023-01-01", "end": "2023-12-31" },
    "location": "Mumbai, India",
    "outputs": ["map", "timeseries"]
  }
}
```

---

## Benefits

### 1. Scalability

- Add new data products without touching executor
- Each workflow is independent and testable
- Router makes dependencies explicit

### 2. Maintainability

- Clear separation of concerns
- Standard interface for all workflows
- Easy to debug individual workflows

### 3. Correctness

- Accurate attribution per dataset
- Type-safe workflow contracts
- Consistent error handling

### 4. Extensibility

- Support for multi-source workflows
- Custom parameters per workflow
- Dataset-specific optimizations (scale, reducers, etc.)

---

## What the Executor Does Now

The executor (`app/api/run/route.ts`) is now **data-product agnostic**:

1. ✅ Validates the analysis plan
2. ✅ Applies guardrails
3. ✅ Checks cache
4. ✅ Initializes GEE
5. ✅ Resolves location to geometry
6. ✅ **Routes to appropriate workflow**
7. ✅ Executes workflow (pure GEE computation)
8. ✅ Calculates statistics
9. ✅ **Uses workflow-provided attribution**
10. ✅ Caches result
11. ✅ Returns result

---

## Next Steps

### Immediate

1. Test vegetation, temperature, and precipitation workflows
2. Fix any guardrails.ts typos (datasetIDs → datasetIds)
3. Update planner to generate plans for new workflows

### Future Workflows

1. **Water extent** (JRC Global Surface Water)
2. **Night lights** (VIIRS DNB) for urbanization
3. **Sentinel-1 SAR** for flood detection
4. **Air quality** (Sentinel-5P NO₂)
5. **Land cover** (ESA WorldCover)

---

## Summary

The executor is now:

- ✅ **Scalable**: Add workflows by creating new files
- ✅ **Correct**: Proper attribution per dataset
- ✅ **Clean**: Single responsibility for each component
- ✅ **Powerful**: Full GEE compute capabilities exposed

The bottleneck was **architectural**, not GEE. This refactor unlocks the full potential of the Earth Engine catalog.
