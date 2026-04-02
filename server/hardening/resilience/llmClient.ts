import { CircuitBreaker } from "../../utils/circuitBreaker";
import { logger } from "../../utils/logger";

let _client: any = null;
async function getClient() {
  if (!_client) {
    const OpenAI = (await import("openai")).default;
    _client = new OpenAI();
  }
  return _client;
}

/**
 * Named circuit breaker for the OpenAI API.
 * - Opens after 5 consecutive failures.
 * - Probes recovery after 30 s cooldown.
 * - Emits ALERT events to the Control Tower event bus on open (handled by CircuitBreaker base).
 */
const breaker = new CircuitBreaker("openai_llm", 5, 30_000);

export interface LlmResponse {
  status: "ok" | "degraded";
  output?: string;
  message?: string;
}

/**
 * Wraps every OpenAI call with the circuit breaker.
 * Falls back gracefully when the breaker is open instead of cascading failures.
 */
export async function safeLlmCall(prompt: string, model = "gpt-4.1-mini"): Promise<LlmResponse> {
  try {
    const response = await breaker.call(async () => {
      const c = await getClient();
      const completion = await c.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
      });
      return completion.choices[0]?.message?.content ?? "";
    });

    return { status: "ok", output: response };
  } catch (err: any) {
    const isOpen = err?.message?.includes("circuit breaker OPEN") ||
                   err?.message?.includes("Circuit breaker OPEN");

    logger.warn("llm_call_failed", {
      circuitOpen: isOpen,
      error: err?.message,
    });

    return {
      status: "degraded",
      message: isOpen
        ? "LLM service temporarily unavailable — using fallback mode."
        : "LLM call failed. System running with reduced capability.",
    };
  }
}

export function getLlmBreakerStatus() {
  return breaker.getState();
}
