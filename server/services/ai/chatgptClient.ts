import crypto from "crypto";
import { applyPHIGuard } from "../../middleware/phiGuardOpenAI";
import { withRetry } from "../../utils/withRetry";
import { openAIBreaker } from "../../utils/circuitBreaker";
import { logger } from "../../utils/logger";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  timestamp: string;
  cached?: boolean;
  phiRedacted?: boolean;
  durationMs?: number;
}

export interface ChatCompletionError extends ChatCompletionResult {
  error: true;
  errorCode?: string;
}

let _client: any = null;

async function getClient() {
  if (!_client) {
    const OpenAI = (await import("openai")).default;
    _client = new OpenAI();
  }
  return _client;
}

const _callAuditLog: Array<{
  ts: string;
  caller: string;
  model: string;
  tokensUsed: number;
  durationMs: number;
  cached: boolean;
  phiRedacted: boolean;
  ok: boolean;
  errorCode?: string;
}> = [];

const MAX_AUDIT = 1000;

let _tokenBudgetUsedToday = 0;
let _tokenBudgetDate = new Date().toDateString();
const TOKEN_BUDGET_DAILY = 2_000_000;
const TOKEN_BUDGET_WARNING_PCT = 0.80;

function trackTokens(used: number) {
  const today = new Date().toDateString();
  if (today !== _tokenBudgetDate) {
    _tokenBudgetUsedToday = 0;
    _tokenBudgetDate = today;
  }
  _tokenBudgetUsedToday += used;
  const pct = _tokenBudgetUsedToday / TOKEN_BUDGET_DAILY;
  if (pct >= TOKEN_BUDGET_WARNING_PCT) {
    logger.warn("openai_token_budget_warning", {
      usedToday: _tokenBudgetUsedToday,
      budgetLimit: TOKEN_BUDGET_DAILY,
      pctUsed: Math.round(pct * 100),
    });
  }
}

function appendAudit(entry: (typeof _callAuditLog)[number]) {
  _callAuditLog.push(entry);
  if (_callAuditLog.length > MAX_AUDIT) _callAuditLog.shift();
}

export function getChatClientAuditLog() {
  return [..._callAuditLog];
}

export function getChatTokenBudgetStatus() {
  return {
    usedToday: _tokenBudgetUsedToday,
    budgetLimit: TOKEN_BUDGET_DAILY,
    pctUsed: Math.round((_tokenBudgetUsedToday / TOKEN_BUDGET_DAILY) * 100),
    date: _tokenBudgetDate,
  };
}

async function upstashGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { result: string | null };
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function upstashSet(key: string, value: string, exSeconds = 3600): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${exSeconds}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
  }
}

function buildCacheKey(messages: ChatMessage[], model: string): string {
  const payload = JSON.stringify({ model, messages });
  return "gpt:cache:" + crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function isCacheableRequest(messages: ChatMessage[]): boolean {
  const combined = messages.map(m => m.content).join(" ");
  return combined.length < 4000;
}

const RETRYABLE_CODES = new Set(["rate_limit_exceeded", "server_error", "timeout"]);

function isRetryable(err: any): boolean {
  const code = err?.code || err?.error?.code || "";
  const status = err?.status || 0;
  return RETRYABLE_CODES.has(code) || status === 429 || status >= 500;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; maxTokens?: number; caller?: string; bypassCache?: boolean }
): Promise<ChatCompletionResult | ChatCompletionError> {
  const model = options?.model || "gpt-4o";
  const caller = options?.caller || "unknown";
  const start = Date.now();
  let phiRedacted = false;
  let cached = false;

  const rawParams: any = {
    model,
    messages: messages as any[],
    max_tokens: options?.maxTokens || 1000,
  };

  const guardedParams = applyPHIGuard(rawParams, caller);
  phiRedacted = JSON.stringify(guardedParams.messages) !== JSON.stringify(rawParams.messages);

  const cacheKey = buildCacheKey(messages, model);
  if (!options?.bypassCache && isCacheableRequest(messages)) {
    const cached_val = await upstashGet(cacheKey);
    if (cached_val) {
      try {
        const parsed = JSON.parse(cached_val) as ChatCompletionResult;
        cached = true;
        appendAudit({
          ts: new Date().toISOString(),
          caller,
          model,
          tokensUsed: parsed.tokensUsed,
          durationMs: Date.now() - start,
          cached: true,
          phiRedacted,
          ok: true,
        });
        return { ...parsed, cached: true, phiRedacted };
      } catch {
      }
    }
  }

  try {
    const response = await openAIBreaker.call(async () => {
      return withRetry(
        async () => {
          try {
            const client = await getClient();
            return await client.chat.completions.create(guardedParams);
          } catch (err: any) {
            if (!isRetryable(err)) throw Object.assign(err, { __noRetry: true });
            throw err;
          }
        },
        3,
        1000
      );
    });

    const content = response.choices?.[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;
    const durationMs = Date.now() - start;

    trackTokens(tokensUsed);

    const result: ChatCompletionResult = {
      content,
      model: response.model || model,
      tokensUsed,
      timestamp: new Date().toISOString(),
      cached: false,
      phiRedacted,
      durationMs,
    };

    if (!options?.bypassCache && isCacheableRequest(messages)) {
      upstashSet(cacheKey, JSON.stringify(result), 3600).catch(() => {});
    }

    appendAudit({ ts: result.timestamp, caller, model, tokensUsed, durationMs, cached, phiRedacted, ok: true });

    logger.info("openai_call_complete", { caller, model, tokensUsed, durationMs, cached, phiRedacted });

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorCode = err?.code || err?.error?.code || "unknown";

    appendAudit({ ts: new Date().toISOString(), caller, model, tokensUsed: 0, durationMs, cached, phiRedacted, ok: false, errorCode });

    logger.error("openai_call_failed", { caller, model, errorCode, durationMs, circuitOpen: errorCode === "CIRCUIT_OPEN" });

    const isCircuitOpen = err?.message?.includes("Circuit breaker OPEN");

    return {
      content: isCircuitOpen
        ? "AI service temporarily unavailable — running in fallback mode. Please retry in 30 seconds."
        : `AI service error: ${err?.message ?? "unknown error"}. Please try again.`,
      model,
      tokensUsed: 0,
      timestamp: new Date().toISOString(),
      cached: false,
      phiRedacted,
      durationMs,
      error: true,
      errorCode,
    };
  }
}
