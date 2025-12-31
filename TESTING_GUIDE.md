# Testing Guide - Satellite Data Explorer PoC

## Phase 4 Implementation Complete ✅

The following phases have been successfully implemented:

- **Phase 0**: Environment setup and dependencies
- **Phase 1**: UX skeleton with React components
- **Phase 2**: API contract validation with Zod schemas
- **Phase 3**: LLM planning agent with OpenAI
- **Phase 4**: Earth Engine integration with NDVI workflows

## Prerequisites

Before testing, you need to configure the following environment variables in `.env.local`:

### Required Configuration

1. **OpenAI API Key** (for LLM planning)

   ```
   OPENAI_API_KEY=sk-proj-...
   ```

2. **Google Earth Engine Credentials** (for satellite data processing)
   ```
   GEE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

### Getting GEE Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Earth Engine API
4. Create a service account with Earth Engine permissions
5. Generate and download a JSON key
6. Extract the `client_email` and `private_key` from the JSON

## How to Test

### 1. Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### 2. Test the Planning API (Optional - Direct API Test)

```bash
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"query": "Show vegetation changes in Tokyo over the past year"}'
```

Expected response: A structured analysis plan in JSON format.

### 3. Test the Full Pipeline via UI

1. Open `http://localhost:3000` in your browser
2. Enter a query like:

   - "Show vegetation changes in Tokyo over the past year"
   - "Analyze NDVI time series for Osaka from 2023 to 2024"
   - "Detect vegetation anomalies in Kyoto"

3. Click "Analyze" and watch the pipeline:
   - **Planning phase**: LLM creates a structured plan
   - **Running phase**: Earth Engine processes satellite data
   - **Done**: Results displayed with map, chart, and summary

### 4. Check the Console

Open browser DevTools console to see:

- Analysis plan (structured JSON)
- Analysis result (with tile URLs and data)
- Any errors

## Expected Behavior

### Successful Execution

When everything works correctly:

1. **Planning phase** (~1-3 seconds)

   - Query is sent to OpenAI
   - LLM returns a structured plan
   - Plan is validated against schema

2. **Running phase** (~5-15 seconds)

   - Earth Engine authenticates
   - Location is resolved to geometry
   - Sentinel-2 data is filtered and processed
   - NDVI calculations are performed
   - Tile URLs and statistics are generated

3. **Results displayed**
   - Map panel shows placeholder (actual map rendering in Phase 6)
   - Chart panel shows placeholder (actual chart in Phase 6)
   - Summary panel shows analysis summary and stats

### Common Issues

**"OpenAI API key not configured"**

- Solution: Add `OPENAI_API_KEY` to `.env.local`

**"GEE credentials not configured"**

- Solution: Add `GEE_SERVICE_ACCOUNT_EMAIL` and `GEE_PRIVATE_KEY` to `.env.local`

**"Earth Engine initialization failed"**

- Check that your private key is properly formatted with `\n` for newlines
- Ensure the service account has Earth Engine permissions
- Verify the GEE API is enabled in your Google Cloud project

**"Unknown location"**

- The PoC only supports hardcoded locations: Tokyo, Osaka, Kyoto, Yokohama, Nagoya, Sapporo, Fukuoka
- Try a query with one of these cities

**"Invalid analysis plan"**

- The LLM returned something that doesn't match our schema
- Check the console for validation errors
- Try rephrasing your query to be more specific about vegetation/NDVI

## Supported Features

### Analysis Types

- `ndvi_timeseries`: Generate time series of vegetation index
- `ndvi_change`: Calculate vegetation change between two periods
- `ndvi_anomaly`: Detect vegetation anomalies
- `seasonal_trend`: Analyze seasonal vegetation patterns

### Datasets

- Sentinel-2 (primary - 10m resolution)
- Landsat 8 (30m resolution)
- MODIS (250m-1km resolution)

### Locations

- Tokyo, Osaka, Kyoto, Yokohama, Nagoya, Sapporo, Fukuoka
- Custom bounding boxes (advanced)

### Outputs

- Map tile URLs (Phase 6 will render these)
- Time series data (Phase 6 will chart these)
- Summary statistics
- Text summary

## What's Not Implemented Yet

The following phases are deferred pending Phase 4 testing:

- **Phase 5**: Explanation Agent (LLM-generated explanations)
- **Phase 6**: Frontend Visualization (actual map/chart rendering)
- **Phase 7**: Caching & Cost Control
- **Phase 8**: Error Handling & Guardrails (enhanced)
- **Phase 9**: PoC Hardening (query limits, demo scenarios)
- **Phase 10**: Success checks

## Troubleshooting

### Enable Detailed Logging

Check the terminal where `npm run dev` is running for server-side logs:

- Earth Engine initialization messages
- API request/response logs
- Error details

### Test Each API Endpoint Separately

1. Test planning only:

   ```bash
   curl -X POST http://localhost:3000/api/plan \
     -H "Content-Type: application/json" \
     -d '{"query": "vegetation in Tokyo"}'
   ```

2. Test execution with a hardcoded plan:
   ```bash
   curl -X POST http://localhost:3000/api/run \
     -H "Content-Type: application/json" \
     -d '{
       "plan": {
         "analysisType": "ndvi_timeseries",
         "datasets": ["sentinel2"],
         "timeRange": {"start": "2024-01-01", "end": "2024-12-31"},
         "location": "Tokyo",
         "outputs": ["map", "timeseries", "summary"]
       }
     }'
   ```

## Next Steps After Testing

Once Phase 4 is verified working:

1. **Phase 5**: Add LLM explanation generation for human-readable insights
2. **Phase 6**: Implement actual map rendering (MapLibre) and charts (Recharts)
3. **Phase 7**: Add caching to reduce API costs
4. **Phase 8**: Enhance error handling and user feedback
5. **Phase 9**: Add query limits and demo scenarios
6. **Phase 10**: Final validation and success checks

## Architecture Overview

```
User Query
    ↓
Frontend (React) → Planning API (/api/plan)
    ↓                      ↓
    |                  OpenAI LLM
    |                      ↓
    |              Validated Plan (Zod)
    ↓                      ↓
Frontend → Execution API (/api/run)
    ↓              ↓
    |      GEE Authentication
    |              ↓
    |      Location Resolution
    |              ↓
    |      NDVI Workflow
    |              ↓
    |      Tile URLs + Stats
    ↓              ↓
Results Display
```

## File Structure

```
/app
  /page.tsx                     # Main UI with state management
  /api
    /plan/route.ts             # LLM planning endpoint
    /run/route.ts              # GEE execution endpoint
/components
  /query-input.tsx             # Query input form
  /results
    /map-panel.tsx             # Map display (placeholder)
    /chart-panel.tsx           # Chart display (placeholder)
    /summary-panel.tsx         # Summary display
/lib
  /schemas
    /analysis-plan.ts          # Zod schema for plans
    /analysis-result.ts        # Zod schema for results
  /gee
    /client.ts                 # GEE initialization
    /earthengine.d.ts          # TypeScript types
    /workflows
      /ndvi.ts                 # NDVI calculations
  /geo
    /resolve-location.ts       # Location to geometry
```

Good luck with testing! 🚀
