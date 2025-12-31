Below is a **step-by-step, execution-oriented implementation plan** written so that **Cline can follow it literally** and you (or a teammate) can build the PoC incrementally without architectural drift.

It assumes:

- A **default Next.js (App Router) repo already deployed on Vercel**
- **VS Code on macOS**
- **JavaScript / TypeScript only**
- No infra provisioning beyond API keys

---

# Implementation Plan

**AI-Driven Satellite Data Explorer (JS-Only PoC)**

---

## Phase 0 — Repo & Environment Baseline

### Step 0.1 — Verify Project Structure

Confirm the repo uses **Next.js App Router**:

```
/app
  /page.tsx
  /layout.tsx
/app/api
/public
/package.json
/tsconfig.json
```

If not App Router, migrate first (out of scope for this plan).

---

### Step 0.2 — Install Core Dependencies

Install frontend, mapping, charting, and utility libraries.

```bash
npm install \
  maplibre-gl \
  recharts \
  zod \
  nanoid \
  clsx \
  lucide-react
```

Install shadcn/ui:

```bash
npx shadcn@latest init
```

Add commonly used shadcn components:

```bash
npx shadcn@latest add \
  button \
  card \
  textarea \
  input \
  select \
  tabs \
  badge \
  skeleton
```

---

### Step 0.3 — Environment Variables

Create `.env.local`:

```env
OPENAI_API_KEY=...
GEE_SERVICE_ACCOUNT_EMAIL=...
GEE_PRIVATE_KEY=...
JAXA_API_BASE_URL=...
```

⚠️ **Never expose these to the client.**
All access goes through API routes.

---

## Phase 1 — UX Skeleton (Frontend First)

### Step 1.1 — Layout & Page Skeleton

Modify `/app/page.tsx`:

- Centered input box
- “Ask about satellite data” placeholder
- Submit button
- Empty results area

**No API calls yet.**

---

### Step 1.2 — Query Input Component

Create:

```
/components/query-input.tsx
```

Responsibilities:

- Controlled textarea
- Submit handler
- Loading state
- Emits raw user query string

---

### Step 1.3 — Results Layout Stub

Create:

```
/components/results/
  map-panel.tsx
  chart-panel.tsx
  summary-panel.tsx
```

Render placeholder cards with skeleton loaders.

---

### Step 1.4 — Client State Orchestration

In `/app/page.tsx`:

- Track:

  - `query`
  - `status` (`idle | planning | running | done | error`)
  - `result`

- Wire submit → fake timeout → render placeholders

This locks UX before backend work.

---

## Phase 2 — API Contract & Validation

### Step 2.1 — Define Analysis Plan Schema

Create:

```
/lib/schemas/analysis-plan.ts
```

Use **Zod** to strictly define allowed plans:

```ts
analysisType: enum
datasets: enum[]
timeRange: { start, end }
location: string | bbox
outputs: enum[]
```

This is **critical** for safety and determinism.

---

### Step 2.2 — Define API Response Schema

Create:

```
/lib/schemas/analysis-result.ts
```

Include:

- Map tile URL(s)
- Time-series array
- Summary stats
- Attribution metadata

---

## Phase 3 — LLM Planning Agent

### Step 3.1 — Planning API Route

Create:

```
/app/api/plan/route.ts
```

Flow:

1. Accept `{ query: string }`
2. Call LLM in **planner-only mode**
3. Force JSON output
4. Validate against Zod schema
5. Reject anything invalid

⚠️ The LLM **never executes code**.

---

### Step 3.2 — Planner Prompt Design

Hardcode system prompt:

- Allowed datasets
- Allowed analyses
- Output format JSON only
- No explanations

Fail fast if output is not valid JSON.

---

### Step 3.3 — Frontend Integration

On submit:

1. Call `/api/plan`
2. Show “Planning analysis…” status
3. Display structured plan in dev console (debug only)

---

## Phase 4 — Earth Engine Integration

### Step 4.1 — GEE Auth Wrapper

Create:

```
/lib/gee/client.ts
```

Responsibilities:

- Initialize GEE with service account
- Export reusable `ee` instance
- Fail loudly if auth fails

This file is **server-only**.

---

### Step 4.2 — AOI Resolution

Create:

```
/lib/geo/resolve-location.ts
```

Supports:

- Named locations (via simple lookup or bounding boxes)
- Hardcoded PoC regions (Osaka, Tokyo, etc.)

Return: bounding box geometry.

---

### Step 4.3 — NDVI Workflow (Core PoC)

Create:

```
/lib/gee/workflows/ndvi.ts
```

Implements:

1. Sentinel-2 filtering
2. Cloud masking
3. NDVI computation
4. Monthly aggregation
5. Mean NDVI stats
6. ΔNDVI image

All logic must be **pure GEE JS**.

---

### Step 4.4 — Execution API Route

Create:

```
/app/api/run/route.ts
```

Flow:

1. Receive validated plan
2. Dispatch to workflow
3. Request:

   - Tile URL
   - Aggregated numbers

4. Return structured result

No LLM here.

---

## Phase 5 — Explanation Agent

### Step 5.1 — Explanation API Route

Create:

```
/app/api/explain/route.ts
```

Input:

- Structured analysis result
- Original user query

Output:

- Plain English explanation
- Confidence disclaimers
- Data sources

---

### Step 5.2 — Explanation Prompt Rules

Prompt must enforce:

- No causal claims
- No certainty beyond data
- Explicit dataset naming
- Timeframe restatement

---

## Phase 6 — Frontend Visualization

### Step 6.1 — Map Rendering

In `map-panel.tsx`:

- Use MapLibre GL
- Load GEE tile URL
- Apply NDVI color ramp
- Support pan/zoom only

---

### Step 6.2 — Chart Rendering

In `chart-panel.tsx`:

- Use Recharts
- Monthly NDVI line chart
- Highlight min/max

---

### Step 6.3 — Summary Rendering

In `summary-panel.tsx`:

- LLM explanation
- Bullet stats
- Dataset attribution badges

---

## Phase 7 — Caching & Cost Control

### Step 7.1 — Cache Key Strategy

Create:

```
/lib/cache/key.ts
```

Hash:

- AOI
- Time range
- Dataset
- Analysis type

---

### Step 7.2 — Cache Storage

Use:

- In-memory (PoC)
- Optional: Vercel KV

Cache:

- GEE results
- LLM explanations

---

## Phase 8 — Error Handling & Guardrails

### Step 8.1 — User-Facing Errors

Handle:

- Unsupported queries
- Dataset unavailable
- GEE failures
- LLM failures

Always return **actionable messages**.

---

### Step 8.2 — Internal Logging

Log:

- Plan JSON
- Execution timing
- Cache hits/misses

Never log secrets.

---

## Phase 9 — PoC Hardening

### Step 9.1 — Limit Query Scope

Enforce:

- Max time range (e.g. 5 years)
- Max AOI size
- Allowed indices only

---

### Step 9.2 — Demo Scenarios

Hardcode example queries:

- Vegetation change
- Seasonal trends
- Anomaly detection

Expose via UI buttons.

---

## Phase 10 — Success Check

The PoC is done when:

- One query → full pipeline executes
- Map + chart + explanation render
- Data sources are explicit
- No Python exists anywhere

---

## Final Note (for Cline)

**Do not optimize early.**
Follow phases in order.
Do not merge steps across phases.

> This PoC succeeds or fails on **clarity of orchestration**, not cleverness.
