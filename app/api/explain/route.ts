import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { z } from "zod";
import { analysisResultSchema } from "@/lib/schemas/analysis-result";
import { generateCacheKey } from "@/lib/cache/key";
import { explanationCache } from "@/lib/cache/store";

/**
 * Input schema for explanation request
 */
const explainRequestSchema = z.object({
  result: analysisResultSchema,
  originalQuery: z.string(),
});

/**
 * Initialize OpenAI client
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * System prompt for explanation generation
 * Enforces scientific rigor and prevents overstatement
 */
const EXPLANATION_SYSTEM_PROMPT = `You are a scientific data interpreter specializing in satellite earth observation analysis.

Your role is to explain analysis results to users in clear, accessible language while maintaining scientific accuracy.

CRITICAL RULES YOU MUST FOLLOW:

1. NO CAUSAL CLAIMS
   - Never state that one thing "caused" another
   - Use "associated with", "correlated with", "coincides with"
   - Example: NOT "deforestation caused temperature rise" 
   - Example: YES "temperature rise coincides with vegetation loss"

2. NO CERTAINTY BEYOND DATA
   - Never claim absolute certainty
   - Use qualifiers: "suggests", "indicates", "appears to show"
   - Acknowledge data limitations
   - Example: "The data suggests a declining trend in vegetation health"

3. EXPLICIT DATASET NAMING
   - Always name the specific satellite/sensor used
   - Example: "Sentinel-2 multispectral imagery" not just "satellite data"
   - Include spatial resolution when relevant
   - Include temporal frequency when relevant

4. TIMEFRAME RESTATEMENT
   - Always restate the exact time period analyzed
   - Example: "Between January 2023 and December 2023..."
   - Never extrapolate beyond the analyzed period

5. CONFIDENCE AND DISCLAIMERS
   - Mention if cloud cover could affect results
   - Note if spatial resolution limits detail
   - Acknowledge if temporal coverage is sparse
   - State if external validation would be beneficial

6. STRUCTURE YOUR RESPONSE:
   - Start with what was analyzed (location, time, data source)
   - Present key findings with appropriate uncertainty
   - Explain any notable patterns or trends
   - End with limitations or caveats

7. AVOID:
   - Policy recommendations
   - Speculation beyond data
   - Emotional language
   - Absolute statements ("definitely", "proves", "confirms")

Your explanation should be 2-4 paragraphs, accessible to non-experts but scientifically sound.`;

/**
 * Generate user prompt from analysis data
 */
function createUserPrompt(
  originalQuery: string,
  result: z.infer<typeof analysisResultSchema>
): string {
  const parts = [
    "ORIGINAL USER QUERY:",
    originalQuery,
    "",
    "ANALYSIS RESULTS:",
  ];

  // Add metadata
  if (result.metadata) {
    parts.push("Analysis Type: " + result.metadata.analysisType);
    parts.push("Location: " + result.metadata.location);
    parts.push(
      `Time Period: ${result.metadata.timeRange.start} to ${result.metadata.timeRange.end}`
    );
    parts.push("");
  }

  // Add statistics
  if (result.stats) {
    parts.push("STATISTICS:");
    if (result.stats.mean !== undefined)
      parts.push(`- Mean: ${result.stats.mean.toFixed(4)}`);
    if (result.stats.min !== undefined)
      parts.push(`- Minimum: ${result.stats.min.toFixed(4)}`);
    if (result.stats.max !== undefined)
      parts.push(`- Maximum: ${result.stats.max.toFixed(4)}`);
    if (result.stats.trend) parts.push(`- Trend: ${result.stats.trend}`);
    if (result.stats.changePercent !== undefined)
      parts.push(
        `- Change: ${
          result.stats.changePercent > 0 ? "+" : ""
        }${result.stats.changePercent.toFixed(2)}%`
      );
    parts.push("");
  }

  // Add time series summary
  if (result.timeSeries && result.timeSeries.length > 0) {
    parts.push(`TIME SERIES DATA: ${result.timeSeries.length} data points`);
    parts.push(
      `- First point: ${
        result.timeSeries[0].date
      } = ${result.timeSeries[0].value.toFixed(4)}`
    );
    parts.push(
      `- Last point: ${
        result.timeSeries[result.timeSeries.length - 1].date
      } = ${result.timeSeries[result.timeSeries.length - 1].value.toFixed(4)}`
    );
    parts.push("");
  }

  // Add data sources
  if (result.attributions && result.attributions.length > 0) {
    parts.push("DATA SOURCES:");
    result.attributions.forEach((attr) => {
      parts.push(`- ${attr.dataset} (${attr.source})`);
      if (attr.dateRange) parts.push(`  Date range: ${attr.dateRange}`);
    });
    parts.push("");
  }

  parts.push(
    "Please provide a clear, scientifically accurate explanation of these results."
  );

  return parts.join("\n");
}

/**
 * POST /api/explain
 * Generates a plain-English explanation of analysis results
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = explainRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request format",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { result, originalQuery } = validationResult.data;

    // Generate cache key based on result metadata and query
    // Use a simplified hash of the result and query for caching
    const resultString = JSON.stringify({
      metadata: result.metadata,
      stats: result.stats,
      timeSeriesLength: result.timeSeries?.length,
    });
    const cacheKey = `explain:${Buffer.from(resultString)
      .toString("base64")
      .substring(0, 32)}:${Buffer.from(originalQuery)
      .toString("base64")
      .substring(0, 32)}`;

    // Check cache first
    const cachedExplanation = explanationCache.get(cacheKey);
    if (cachedExplanation) {
      console.log("[Explain API] Cache hit:", cacheKey);
      return NextResponse.json({
        explanation: cachedExplanation,
        metadata: {
          cached: true,
          generationTime: 0,
        },
      });
    }

    console.log("[Explain API] Cache miss, generating explanation:", cacheKey);

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        {
          error: "Service configuration error",
          message: "AI explanation service is not configured",
        },
        { status: 500 }
      );
    }

    // Generate user prompt
    const userPrompt = createUserPrompt(originalQuery, result);

    console.log("[Explain API] Generating explanation...");
    console.log("[Explain API] Original query:", originalQuery);

    const startTime = Date.now();

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: EXPLANATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent, factual responses
      max_tokens: 1000,
    });

    const explanation = completion.choices[0]?.message?.content;

    if (!explanation) {
      throw new Error("No explanation generated");
    }

    const duration = Date.now() - startTime;

    console.log("[Explain API] ===== LLM OUTPUT START =====");
    console.log(`[Explain API] Model: ${completion.model}`);
    console.log(
      `[Explain API] Tokens used: ${completion.usage?.total_tokens || "N/A"}`
    );
    console.log(`[Explain API] Generation time: ${duration}ms`);
    console.log("[Explain API] Generated explanation:");
    console.log(explanation);
    console.log("[Explain API] ===== LLM OUTPUT END =====");

    // Store in cache
    explanationCache.set(cacheKey, explanation);

    return NextResponse.json({
      explanation,
      metadata: {
        model: completion.model,
        tokensUsed: completion.usage?.total_tokens,
        generationTime: duration,
        cached: false,
      },
    });
  } catch (error) {
    console.error("[Explain API] Error:", error);

    // Handle OpenAI-specific errors
    if (error instanceof OpenAI.APIError) {
      let userMessage = "Failed to generate explanation.";

      if (error.status === 429) {
        userMessage =
          "The AI service is currently busy. Please try again in a moment.";
      } else if (error.status === 401 || error.status === 403) {
        userMessage =
          "AI service authentication failed. Please contact support.";
      }

      return NextResponse.json(
        {
          error: "AI service error",
          message: userMessage,
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        },
        { status: error.status || 500 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: "Explanation generation failed",
        message:
          "An unexpected error occurred while generating the explanation.",
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 }
    );
  }
}
