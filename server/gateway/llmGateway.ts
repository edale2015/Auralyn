/**
 * llmGateway.ts
 *
 * LLM GATEWAY — BIFROST ARCHITECTURE PRINCIPLES FOR AURALYN
 *
 * Provides:
 *   1. Automatic failover — Anthropic down → OpenAI takes over, zero code change
 *   2. Semantic caching — same UTI complaint with same symptoms → cache hit, ~$0
 *   3. Request logging — every model call tracked in the audit chain
 *   4. Model abstraction — swap models without touching pipeline code
 *   5. Cost tracking — real-time estimate per case
 *
 * SEMANTIC CACHE TTL: 4 hours (clinical guidelines don't change intraday).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI    from "openai";
import { createHash } from "crypto";
import { appendAuditEvent } from "../governance/audit";
import { localDevComplete } from "../dev/localDevHarness";
import { getRoutedModel } from "../context/modelRouter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelPurpose =
  | "clinical_brain"
  | "retrieval_pruner"
  | "uncertainty_sampler"
  | "intent_parser"
  | "kb_validator"
  | "skill_generator"
  | "discharge_generator"
  | "cme_quiz";

interface GatewayRequest {
  purpose:     ModelPurpose;
  messages:    Array<{ role: "user" | "assistant"; content: string }>;
  system?:     string;
  maxTokens?:  number;
  cacheKey?:   string;
  skipCache?:  boolean;
}

export interface GatewayResponse {
  content:          string;
  model:            string;
  provider:         "anthropic" | "openai" | "ollama_local";
  fromCache:        boolean;
  tokensUsed:       number;
  estimatedCostUsd: number;
  latencyMs:        number;
}

// ─── Model routing ─────────────────────────────────────────────────────────────

const MODEL_ROUTING: Record<ModelPurpose, {
  primary:         { provider: "anthropic" | "openai"; model: string };
  fallback:        { provider: "anthropic" | "openai"; model: string };
  costPer1kTokens: number;
}> = {
  clinical_brain: {
    primary:         { provider: "anthropic", model: "claude-opus-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o" },
    costPer1kTokens: 0.025,
  },
  retrieval_pruner: {
    primary:         { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o-mini" },
    costPer1kTokens: 0.004,
  },
  uncertainty_sampler: {
    primary:         { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o-mini" },
    costPer1kTokens: 0.004,
  },
  intent_parser: {
    primary:         { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o-mini" },
    costPer1kTokens: 0.004,
  },
  kb_validator: {
    primary:         { provider: "anthropic", model: "claude-opus-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o" },
    costPer1kTokens: 0.025,
  },
  skill_generator: {
    primary:         { provider: "anthropic", model: "claude-opus-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o" },
    costPer1kTokens: 0.025,
  },
  discharge_generator: {
    primary:         { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o-mini" },
    costPer1kTokens: 0.004,
  },
  cme_quiz: {
    primary:         { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    fallback:        { provider: "openai",    model: "gpt-4o-mini" },
    costPer1kTokens: 0.004,
  },
};

// ─── Semantic cache ────────────────────────────────────────────────────────────

interface CacheEntry {
  response:    string;
  model:       string;
  provider:    "anthropic" | "openai";
  tokensUsed:  number;
  cachedAt:    number;
  hitCount:    number;
}

const CACHE_TTL_MS   = 4 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

class SemanticCache {
  private cache = new Map<string, CacheEntry>();

  private makeKey(cacheKey: string, purpose: ModelPurpose): string {
    return createHash("sha256").update(`${purpose}:${cacheKey}`).digest("hex").slice(0, 16);
  }

  get(cacheKey: string, purpose: ModelPurpose): CacheEntry | null {
    const key   = this.makeKey(cacheKey, purpose);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { this.cache.delete(key); return null; }
    entry.hitCount++;
    return entry;
  }

  set(cacheKey: string, purpose: ModelPurpose, response: string, meta: {
    model: string; provider: "anthropic" | "openai"; tokensUsed: number;
  }): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    const key = this.makeKey(cacheKey, purpose);
    this.cache.set(key, {
      response,
      model:     meta.model,
      provider:  meta.provider,
      tokensUsed: meta.tokensUsed,
      cachedAt:  Date.now(),
      hitCount:  0,
    });
  }

  stats(): { size: number; totalHits: number } {
    let totalHits = 0;
    this.cache.forEach(e => totalHits += e.hitCount);
    return { size: this.cache.size, totalHits };
  }
}

const semanticCache = new SemanticCache();

// ─── Providers ─────────────────────────────────────────────────────────────────

const anthropicClient = new Anthropic();

// Use Replit AI integration key if available, fall back to OPENAI_API_KEY
const openaiApiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const openaiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

const openaiClient = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey, ...(openaiBaseUrl ? { baseURL: openaiBaseUrl } : {}) })
  : null;

async function callAnthropic(
  model: string,
  messages: GatewayRequest["messages"],
  system?: string,
  maxTokens?: number
): Promise<{ content: string; tokensUsed: number }> {
  const response = await anthropicClient.messages.create({
    model,
    max_tokens: maxTokens ?? 1500,
    system,
    messages,
  });
  const content    = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  return { content, tokensUsed };
}

async function callOpenAI(
  model: string,
  messages: GatewayRequest["messages"],
  system?: string,
  maxTokens?: number
): Promise<{ content: string; tokensUsed: number }> {
  if (!openaiClient) throw new Error("OpenAI client not configured — set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY");
  const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];
  const response = await openaiClient.chat.completions.create({
    model,
    max_tokens: maxTokens ?? 1500,
    messages: oaiMessages,
  });
  const content    = response.choices[0]?.message?.content ?? "";
  const tokensUsed = response.usage?.total_tokens ?? 0;
  return { content, tokensUsed };
}

// ─── Main gateway ──────────────────────────────────────────────────────────────

export const llmGateway = {

  async complete(request: GatewayRequest): Promise<GatewayResponse> {
    const startMs = Date.now();
    const routing = MODEL_ROUTING[request.purpose];

    // ── Local dev harness (dev only — no-op in production) ────────────────────
    const localResult = await localDevComplete({
      purpose:   request.purpose,
      messages:  request.messages,
      system:    request.system,
      maxTokens: request.maxTokens,
    }).catch(() => null);

    if (localResult) {
      return {
        content:          localResult.content,
        model:            localResult.model,
        provider:         "ollama_local",
        fromCache:        false,
        tokensUsed:       0,
        estimatedCostUsd: 0,
        latencyMs:        Date.now() - startMs,
      };
    }

    // ── Semantic cache check ──────────────────────────────────────────────────
    if (request.cacheKey && !request.skipCache) {
      const cached = semanticCache.get(request.cacheKey, request.purpose);
      if (cached) {
        return {
          content:          cached.response,
          model:            cached.model,
          provider:         cached.provider,
          fromCache:        true,
          tokensUsed:       0,
          estimatedCostUsd: 0,
          latencyMs:        Date.now() - startMs,
        };
      }
    }

    // ── T018: Model router — selects optimal model per agent via scorecard ────
    // clinical_brain / kb_validator / skill_generator are PINNED — router always
    // returns their fixed model and rejects any scorecard downgrade.
    // Non-pinned agents (intent_parser, retrieval_pruner, etc.) get routed to
    // the highest-scoring model within their latency budget.
    const routerDecision = getRoutedModel(request.purpose);

    // ── Try primary provider ──────────────────────────────────────────────────
    let content:    string;
    let tokensUsed: number;
    let provider:   "anthropic" | "openai" = routerDecision.provider;
    let model       = routerDecision.model;

    try {
      if (provider === "anthropic") {
        ({ content, tokensUsed } = await callAnthropic(model, request.messages, request.system, request.maxTokens));
      } else {
        ({ content, tokensUsed } = await callOpenAI(model, request.messages, request.system, request.maxTokens));
      }
    } catch (primaryError: any) {
      // ── Automatic failover ────────────────────────────────────────────────
      console.warn(`[LLMGateway] Primary (${routing.primary.provider}) failed: ${primaryError.message}. Falling back to ${routing.fallback.provider}.`);
      await appendAuditEvent({
        actor:      "system",
        action:     "LLM_GATEWAY_FAILOVER",
        entityId:   request.purpose,
        entityType: "system",
        details: {
          primaryProvider:  routing.primary.provider,
          primaryModel:     routing.primary.model,
          fallbackProvider: routing.fallback.provider,
          fallbackModel:    routing.fallback.model,
          error:            primaryError.message?.slice(0, 200),
        },
      }).catch(console.error);

      provider = routing.fallback.provider;
      model    = routing.fallback.model;
      if (routing.fallback.provider === "anthropic") {
        ({ content, tokensUsed } = await callAnthropic(model, request.messages, request.system, request.maxTokens));
      } else {
        ({ content, tokensUsed } = await callOpenAI(model, request.messages, request.system, request.maxTokens));
      }
    }

    const estimatedCostUsd = (tokensUsed / 1000) * routing.costPer1kTokens;
    const latencyMs        = Date.now() - startMs;

    // ── Cache successful response ─────────────────────────────────────────────
    if (request.cacheKey && !request.skipCache) {
      semanticCache.set(request.cacheKey, request.purpose, content, { model, provider, tokensUsed });
    }

    // ── Audit every model call ────────────────────────────────────────────────
    await appendAuditEvent({
      actor:      "system",
      action:     "LLM_GATEWAY_CALL",
      entityId:   request.purpose,
      entityType: "llm_call",
      details: {
        purpose:          request.purpose,
        model,
        provider,
        tokensUsed,
        estimatedCostUsd: Math.round(estimatedCostUsd * 1000) / 1000,
        latencyMs,
        fromCache:        false,
      },
    }).catch(console.error);

    return { content, model, provider, fromCache: false, tokensUsed, estimatedCostUsd, latencyMs };
  },

  cacheStats(): { size: number; totalHits: number } {
    return semanticCache.stats();
  },
};
