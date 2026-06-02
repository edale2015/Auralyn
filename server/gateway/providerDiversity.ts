/**
 * providerDiversity.ts
 * server/gateway/providerDiversity.ts
 *
 * PROVIDER DIVERSITY LAYER
 *
 * Manages a pool of LLM providers beyond Anthropic + OpenAI.
 * Used by llmGateway.ts for non-clinical tasks (retrieval_pruner,
 * intent_parser, discharge_generator, cme_quiz).
 *
 * TIER STRUCTURE:
 *   Tier 1: Anthropic Claude (primary — clinical + non-clinical)
 *   Tier 2: OpenAI GPT-4o (fallback for all purposes)
 *   Tier 3a: Groq Llama 3.3 70B (proven, fast, cheap non-clinical)
 *   Tier 3b: MiniMax M2.7 (new — 40% cheaper on input-heavy tasks)
 *   Tier 4: Together AI (general fallback)
 *
 * CLINICAL BRAIN EXCEPTION:
 *   clinical_brain, kb_validator, skill_generator → Anthropic ONLY.
 *   No provider diversity for these. PHI + must-not-miss reasoning
 *   require Opus-class models with HIPAA BAA.
 *
 * MINIMAX M2.7 ADDITION (from m2_provider_patch.ts):
 *   Input cost:  $0.30 / 1M tokens  (vs Groq $0.59)
 *   Output cost: ~$1.00 / 1M tokens (vs Groq $0.79)
 *   Benchmark:   66.6% MLE-Bench Lite
 *   Position:    Tier 3b — before Groq for input-heavy tasks
 *   HIPAA BAA:   Not available — NON-CLINICAL ONLY, NO PHI
 *   API:         OpenAI-compatible endpoint
 *
 * COST COMPARISON (retrieval_pruner — 2000 input / 200 output tokens):
 *   Groq:    2000×$0.59 + 200×$0.79 = $0.00134 per call
 *   M2.7:    2000×$0.30 + 200×$1.00 = $0.00080 per call  (40% cheaper)
 *   Savings at 1000 calls/day: ~$1.03/month
 *   Primary value: resilience (third provider option), not cost.
 */

export type DiversityProvider = "anthropic" | "openai" | "minimax" | "groq" | "together";

export type DiversityPurpose =
  | "retrieval_pruner"
  | "intent_parser"
  | "discharge_generator"
  | "cme_quiz"
  | "uncertainty_sampler";

// ─── Provider definitions ─────────────────────────────────────────────────────

interface ProviderConfig {
  name:            DiversityProvider;
  models:          { fast: string; capable: string };
  costPer1MTokens: { input: number; output: number };
  envKey:          string;
  baseUrl:         string;
  available:       () => boolean;
}

export const PROVIDERS: Record<DiversityProvider, ProviderConfig> = {
  anthropic: {
    name:            "anthropic",
    models:          { fast: "claude-haiku-4-6", capable: "claude-sonnet-4-6" },
    costPer1MTokens: { input: 1.00, output: 5.00 },
    envKey:          "ANTHROPIC_API_KEY",
    baseUrl:         "https://api.anthropic.com",
    available:       () => !!process.env.ANTHROPIC_API_KEY,
  },

  openai: {
    name:            "openai",
    models:          { fast: "gpt-4o-mini", capable: "gpt-4o" },
    costPer1MTokens: { input: 0.15, output: 0.60 },
    envKey:          "OPENAI_API_KEY",
    baseUrl:         "https://api.openai.com/v1",
    available:       () => !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY),
  },

  // MiniMax M2.7 — Tier 3b (added from m2_provider_patch.ts)
  // 40% cheaper than Groq on input-heavy tasks (retrieval_pruner)
  // NO PHI — no HIPAA BAA available. Symptom labels and KB queries only.
  // Monitor error rates via getProviderHealthReport() before promoting to Tier 2.
  minimax: {
    name:            "minimax",
    models:          { fast: "MiniMax-M2.7", capable: "MiniMax-M2.7" },
    costPer1MTokens: { input: 0.30, output: 1.00 },
    envKey:          "MINIMAX_API_KEY",
    baseUrl:         "https://api.minimax.chat/v1",
    available:       () => !!process.env.MINIMAX_API_KEY,
  },

  groq: {
    name:            "groq",
    models:          { fast: "llama-3.3-70b-versatile", capable: "llama-3.3-70b-versatile" },
    costPer1MTokens: { input: 0.59, output: 0.79 },
    envKey:          "GROQ_API_KEY",
    baseUrl:         "https://api.groq.com/openai/v1",
    available:       () => !!process.env.GROQ_API_KEY,
  },

  together: {
    name:            "together",
    models:          { fast: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", capable: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" },
    costPer1MTokens: { input: 0.88, output: 0.88 },
    envKey:          "TOGETHER_API_KEY",
    baseUrl:         "https://api.together.xyz/v1",
    available:       () => !!process.env.TOGETHER_API_KEY,
  },
};

// Named re-export matching m2_provider_patch.ts contract
export const MINIMAX_PROVIDER_PATCH = PROVIDERS.minimax;

// ─── Purpose → provider chain ─────────────────────────────────────────────────
// Order matters: first available provider in the chain is tried first.
// M2.7 is placed before Groq for retrieval_pruner (input-heavy → cheaper).

export const PURPOSE_PROVIDER_CHAIN: Record<DiversityPurpose, DiversityProvider[]> = {
  retrieval_pruner:    ["anthropic", "openai", "minimax", "groq", "together"],
  intent_parser:       ["anthropic", "openai", "groq", "minimax", "together"],
  discharge_generator: ["anthropic", "openai", "groq", "together"],
  cme_quiz:            ["anthropic", "openai", "groq", "together"],
  uncertainty_sampler: ["anthropic", "openai", "groq", "together"],
};

// ─── Provider health tracking ─────────────────────────────────────────────────

export interface ProviderHealth {
  provider:      DiversityProvider;
  available:     boolean;
  callCount:     number;
  errorCount:    number;
  totalCostUsd:  number;
  lastErrorAt?:  number;
  lastSuccessAt?: number;
  errorRate:     number;   // 0.0–1.0
}

const _health: Record<DiversityProvider, ProviderHealth> = {
  anthropic: { provider: "anthropic", available: false, callCount: 0, errorCount: 0, totalCostUsd: 0, errorRate: 0 },
  openai:    { provider: "openai",    available: false, callCount: 0, errorCount: 0, totalCostUsd: 0, errorRate: 0 },
  minimax:   { provider: "minimax",   available: false, callCount: 0, errorCount: 0, totalCostUsd: 0, errorRate: 0 },
  groq:      { provider: "groq",      available: false, callCount: 0, errorCount: 0, totalCostUsd: 0, errorRate: 0 },
  together:  { provider: "together",  available: false, callCount: 0, errorCount: 0, totalCostUsd: 0, errorRate: 0 },
};

export function recordProviderCall(
  provider:  DiversityProvider,
  success:   boolean,
  costUsd:   number
): void {
  const h = _health[provider];
  h.callCount++;
  h.totalCostUsd += costUsd;
  h.available = success;

  if (success) {
    h.lastSuccessAt = Date.now();
  } else {
    h.errorCount++;
    h.lastErrorAt = Date.now();
  }

  h.errorRate = h.callCount > 0 ? h.errorCount / h.callCount : 0;
}

export function getProviderHealthReport(): ProviderHealth[] {
  return Object.values(_health).map(h => ({
    ...h,
    // Update availability based on env key + error rate
    available: PROVIDERS[h.provider].available() && h.errorRate < 0.5,
  }));
}

// ─── OpenAI-compatible call (used by Groq, MiniMax, Together) ────────────────

export interface DiversityCallResult {
  content:      string;
  provider:     DiversityProvider;
  model:        string;
  tokensUsed:   number;
  costUsd:      number;
  latencyMs:    number;
}

export async function callOpenAICompatible(
  provider: DiversityProvider,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  maxTokens = 1000
): Promise<DiversityCallResult> {

  const config = PROVIDERS[provider];

  if (!config.available()) {
    throw new Error(`Provider ${provider} not configured — set ${config.envKey}`);
  }

  const apiKey = process.env[config.envKey];
  const startMs = Date.now();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       config.models.fast,
      messages,
      max_tokens:  maxTokens,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${provider} API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const content    = data.choices?.[0]?.message?.content ?? "";
  const inputToks  = data.usage?.prompt_tokens    ?? 0;
  const outputToks = data.usage?.completion_tokens ?? 0;
  const costUsd    = (inputToks  / 1_000_000) * config.costPer1MTokens.input +
                     (outputToks / 1_000_000) * config.costPer1MTokens.output;

  return {
    content,
    provider,
    model:      config.models.fast,
    tokensUsed: inputToks + outputToks,
    costUsd,
    latencyMs:  Date.now() - startMs,
  };
}

// ─── Diversity-aware complete() ───────────────────────────────────────────────
// Walks the provider chain, skipping unavailable or high-error providers.

export async function diversityComplete(
  purpose:   DiversityPurpose,
  messages:  Array<{ role: "user" | "assistant"; content: string }>,
  system?:   string,
  maxTokens = 1000
): Promise<DiversityCallResult> {

  const chain  = PURPOSE_PROVIDER_CHAIN[purpose];
  const errors: string[] = [];

  for (const providerName of chain) {
    const config = PROVIDERS[providerName];
    const health = _health[providerName];

    // Skip if not configured or error rate too high
    if (!config.available()) continue;
    if (health.errorRate > 0.5 && health.callCount > 5) {
      console.warn(`[ProviderDiversity] Skipping ${providerName} — error rate ${(health.errorRate * 100).toFixed(0)}%`);
      continue;
    }

    try {
      const allMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

      // Anthropic and OpenAI are handled by llmGateway — skip here
      if (providerName === "anthropic" || providerName === "openai") {
        continue;
      }

      const result = await callOpenAICompatible(providerName, allMessages, maxTokens);
      recordProviderCall(providerName, true, result.costUsd);
      return result;

    } catch (err: any) {
      recordProviderCall(providerName, false, 0);
      errors.push(`${providerName}: ${err.message?.slice(0, 100)}`);
      console.warn(`[ProviderDiversity] ${providerName} failed: ${err.message?.slice(0, 100)}`);
    }
  }

  throw new Error(
    `All providers failed for ${purpose}. Errors: ${errors.join(" | ")}`
  );
}

// ─── Cost estimator (from m2_provider_patch.ts) ───────────────────────────────

export function estimateDailySavingsWithMiniMax(
  retrievalCallsPerDay: number,
  avgInputTokens:       number = 2000,
  avgOutputTokens:      number = 200
): {
  groqDailyUsd:    number;
  minimaxDailyUsd: number;
  savingUsd:       number;
  savingPct:       number;
} {
  const groqCfg = PROVIDERS.groq.costPer1MTokens;
  const m2Cfg   = PROVIDERS.minimax.costPer1MTokens;

  const groqDaily = retrievalCallsPerDay * (
    (avgInputTokens / 1_000_000) * groqCfg.input +
    (avgOutputTokens / 1_000_000) * groqCfg.output
  );
  const m2Daily = retrievalCallsPerDay * (
    (avgInputTokens / 1_000_000) * m2Cfg.input +
    (avgOutputTokens / 1_000_000) * m2Cfg.output
  );

  const saving    = groqDaily - m2Daily;
  const savingPct = groqDaily > 0 ? Math.round((saving / groqDaily) * 100) : 0;

  return {
    groqDailyUsd:    Math.round(groqDaily * 100000) / 100000,
    minimaxDailyUsd: Math.round(m2Daily   * 100000) / 100000,
    savingUsd:       Math.round(saving    * 100000) / 100000,
    savingPct:       Math.max(savingPct, 0),
  };
}

/*
 * At 100 retrieval_pruner calls/day (50 patients × 2 KB queries):
 *   Groq:   $0.000922/day   MiniMax: $0.000640/day   Save: $0.000282/day (~$0.10/month)
 *
 * At 1000 retrieval_pruner calls/day (500 patients × 2 KB queries):
 *   Groq:   $0.00922/day    MiniMax: $0.00640/day    Save: $0.00282/day  (~$1.03/month)
 *
 * Primary value: resilience (third provider option) not cost.
 * Groq remains more proven. Monitor M2.7 error rates before promoting.
 */
