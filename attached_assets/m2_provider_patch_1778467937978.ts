/**
 * m2_provider_patch.ts
 *
 * MINIMAX M2.7 PROVIDER ADDITION
 *
 * Patch for server/gateway/providerDiversity.ts
 *
 * M2.7 SPECS (from article):
 *   Input cost:  $0.30 / 1M tokens
 *   Output cost: Not specified — estimate $1.00/1M (frontier-grade)
 *   Benchmark:   66.6% MLE-Bench Lite (ties Gemini 3.1)
 *   API:         OpenAI-compatible endpoint
 *
 * COST COMPARISON FOR AURALYN NON-CLINICAL TASKS:
 *   Groq Llama 3.3 70B: $0.59 input / $0.79 output
 *   MiniMax M2.7:       $0.30 input / ~$1.00 output
 *
 *   For retrieval_pruner (input-heavy, short output):
 *     Groq:    2000 input × $0.59 + 200 output × $0.79 = $0.00134
 *     M2.7:    2000 input × $0.30 + 200 output × $1.00 = $0.00080
 *     Saving:  40% cheaper for input-heavy tasks
 *
 *   For intent_parser (very short input + output):
 *     Both are near-zero cost — Groq is simpler to maintain
 *
 * RECOMMENDATION:
 *   Add M2.7 as Tier 3b (alongside Groq) for input-heavy tasks only.
 *   Do not replace Groq — maintain both as fallback options.
 *   NEVER for clinical_brain (Anthropic Opus only — patient safety).
 *
 * HOW TO APPLY:
 * In server/gateway/providerDiversity.ts:
 *
 * 1. Add to PROVIDERS object:
 *
 *   minimax: {
 *     name:    "minimax",
 *     models:  { fast: "MiniMax-M2.7", capable: "MiniMax-M2.7" },
 *     costPer1MTokens: { input: 0.30, output: 1.00 },
 *     envKey:  "MINIMAX_API_KEY",
 *     baseUrl: "https://api.minimax.chat/v1",
 *     available: () => !!process.env.MINIMAX_API_KEY,
 *   }
 *
 * 2. Add to PURPOSE_PROVIDER_CHAIN for retrieval_pruner:
 *
 *   retrieval_pruner: ["anthropic", "openai", "minimax", "groq"],
 *
 *   (M2.7 before Groq for retrieval_pruner because it is cheaper on input-heavy tasks)
 *
 * 3. Add to .env:
 *   MINIMAX_API_KEY=your_key_here
 *   # Get from: platform.minimaxi.com
 *
 * 4. Update ProviderHealth initial state:
 *   minimax: { provider: "minimax", available: false, callCount: 0, errorCount: 0, totalCostUsd: 0 },
 *
 * IMPORTANT CAVEAT:
 * M2.7's API availability and reliability outside China is not yet verified
 * at production scale. Add as Tier 3b (not primary fallback) and monitor
 * error rates via getProviderHealthReport() before promoting to Tier 2.
 * Groq remains the more proven option for now.
 *
 * WHY NOT USE M2.7 FOR CLINICAL_BRAIN:
 * The article notes M2.7 scores 66.6% on MLE-Bench vs Opus 4.6 at 75.7%.
 * That 9-point gap matters for clinical reasoning. More importantly:
 * M2.7 has no HIPAA BAA currently available. Anthropic has one.
 * clinical_brain touches PHI. Non-clinical tasks (retrieval_pruner,
 * intent_parser) can be isolated from PHI with careful prompt design.
 * PHI never goes to Groq or M2.7 — only symptom labels and KB queries.
 */

export const MINIMAX_PROVIDER_PATCH = {
  name:    "minimax" as const,
  models:  { fast: "MiniMax-M2.7", capable: "MiniMax-M2.7" },
  costPer1MTokens: { input: 0.30, output: 1.00 },
  envKey:  "MINIMAX_API_KEY",
  baseUrl: "https://api.minimax.chat/v1",
  available: () => !!process.env.MINIMAX_API_KEY,
};

// Updated provider chain for retrieval_pruner with M2.7:
export const UPDATED_RETRIEVAL_PRUNER_CHAIN =
  ["anthropic", "openai", "minimax", "groq", "together"] as const;

// Cost comparison helper
export function estimateDailySavingsWithM2(
  retrievalCallsPerDay: number,
  avgInputTokens:       number = 2000,
  avgOutputTokens:      number = 200
): {
  groqDailyUsd:    number;
  minimaxDailyUsd: number;
  savingUsd:       number;
  savingPct:       number;
} {
  const groqInput   = 0.59 / 1_000_000;
  const groqOutput  = 0.79 / 1_000_000;
  const m2Input     = 0.30 / 1_000_000;
  const m2Output    = 1.00 / 1_000_000;

  const groqDaily   = retrievalCallsPerDay * (avgInputTokens * groqInput + avgOutputTokens * groqOutput);
  const m2Daily     = retrievalCallsPerDay * (avgInputTokens * m2Input   + avgOutputTokens * m2Output);
  const saving      = groqDaily - m2Daily;
  const savingPct   = Math.round((saving / groqDaily) * 100);

  return {
    groqDailyUsd:    Math.round(groqDaily   * 100000) / 100000,
    minimaxDailyUsd: Math.round(m2Daily     * 100000) / 100000,
    savingUsd:       Math.round(saving      * 100000) / 100000,
    savingPct:       Math.max(savingPct, 0),
  };
}

/*
 * At 100 retrieval_pruner calls/day (50 patients × 2 KB queries):
 * Groq:    $0.000922/day
 * M2.7:    $0.000640/day
 * Saving:  $0.000282/day = ~$0.10/month
 *
 * At 1000 retrieval_pruner calls/day (500 patients × 2 KB queries):
 * Groq:    $0.00922/day
 * M2.7:    $0.00640/day
 * Saving:  $0.00282/day = ~$1.03/month
 *
 * Conclusion: M2.7 is worth adding to the chain but the savings are modest
 * compared to the Haiku vs Opus savings already implemented.
 * Primary value is resilience (third provider option) not cost.
 */
