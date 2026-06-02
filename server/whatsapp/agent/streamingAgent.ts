// Streaming LLM conversation agent.
//
//   - One LLM call per patient turn (Claude Sonnet, streaming).
//   - Full system prompt loaded once when the complaint is matched.
//   - Conversation history is passed every turn.
//   - NO per-turn database calls.
//   - NO per-turn field extraction.
//   - NO per-turn rule engine.
//   - The ONLY database call is at the end of the conversation, by
//     buildPhysicianPacket in physicianPacket.ts.
//
// PHYSICIAN-REVIEW RULE: this agent never tells the patient where to go.
// Auralyn collects, the physician decides. The only sentence the agent
// uses to close is the fixed handoff phrase below; everything else is
// data-gathering. Genuine life-threatening keywords are caught BEFORE
// this agent is invoked by isInstantKeywordEscalation in kbIntake.ts.

import Anthropic from "@anthropic-ai/sdk";
import { getSystemPrompt, hasSystemPrompt, getFallbackQuestion } from "./prompts/registry";

// Current Sonnet model. The previous ID claude-sonnet-4-20250514 hit Anthropic
// end-of-life and now returns 404 not_found_error.
const ANTHROPIC_MODEL  = "claude-sonnet-4-6";
// One question per turn ≈ 20-40 words. 150 tokens is plenty and cuts
// generation time roughly in half versus the original 350 cap.
const MAX_OUTPUT_TOKENS = 150;
// Lower temperature → faster sampling, more consistent triage wording.
const TEMPERATURE       = 0.3;
const MIN_USER_TURNS_BEFORE_CLOSE = 6;   // close-detection cannot fire below this floor
const MAX_USER_TURNS    = 15;            // force-close after this many patient messages
// 8s hard ceiling. On timeout we serve the next pre-written protocol question
// instead of stalling the patient. Target end-to-end latency is < 5s.
const REQUEST_TIMEOUT_MS = 8_000;

// The exact closing phrase the prompt instructs the model to emit. Matching
// any of these substrings (case-insensitive) flips the session to closed —
// but ONLY after MIN_USER_TURNS_BEFORE_CLOSE patient turns have happened,
// so the model can't accidentally close on turn 1 by quoting the phrase.
const CLOSING_MARKERS: RegExp[] = [
  /sending your information to our care team/i,
  /in touch with you shortly/i,
];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    // Replit Secrets preserve the casing the user typed, so the same secret
    // may live under either name. The rest of this codebase accepts both —
    // we mirror that here so the agent works regardless of secret casing.
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Pre-warm the Anthropic SDK at server startup: one minimal completion to
 * establish the client, TCP/TLS connection pool, and messages route before
 * the first real patient turn pays that cold-start cost (previously ~30s on
 * the first message). The streaming agent is the patient-facing path for
 * every protocol slug, so warming it warms the whole WhatsApp triage hot path.
 *
 * Fire-and-forget: any failure (no key, transient 5xx) is swallowed — the
 * first real call simply pays the cold-start cost itself.
 */
export function prewarmAnthropicConnection(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
  if (!apiKey) {
    console.log("[StreamingAgent] Anthropic prewarm skipped — no API key set");
    return;
  }
  const t0 = Date.now();
  client().messages.create({
    model:       ANTHROPIC_MODEL,
    max_tokens:  1,
    temperature: 0,
    messages:    [{ role: "user", content: "ok" }],
  })
    .then(() => console.log(`[StreamingAgent] Anthropic prewarm OK in ${Date.now() - t0}ms (model=${ANTHROPIC_MODEL})`))
    .catch((e: any) => console.warn(`[StreamingAgent] Anthropic prewarm failed: ${e?.message ?? e}`));
}

export interface AgentSession {
  slug:          string;                                                   // complaint slug; selects the system prompt
  exchanges:     Array<{ role: "user" | "assistant"; content: string }>;   // full conversation history
  closed:        boolean;                                                  // true once the closing handoff was sent
  startedAt:     number;
  closedAt?:     number;
  closeReason?:  "model_closed" | "max_turns";
}

/** Create a fresh agent session if a system prompt is registered for the slug. */
export function startAgentSession(slug: string): AgentSession | null {
  if (!hasSystemPrompt(slug)) return null;
  return {
    slug,
    exchanges: [],
    closed:    false,
    startedAt: Date.now(),
  };
}

export interface AgentReply {
  text:      string;
  closed:    boolean;
  reason?:   "model_closed" | "max_turns";
  latencyMs: number;
}

/**
 * Generate the next assistant reply for a patient turn. Streams Claude Sonnet
 * and accumulates the full response (WhatsApp delivers atomic messages, so the
 * benefit of streaming is reduced time-to-first-token, not partial delivery).
 *
 * Mutates `session.exchanges` in place: appends the patient message and the
 * generated assistant reply. Flips `session.closed` when the model emits the
 * fixed closing phrase or the conversation hits MAX_USER_TURNS.
 */
export async function nextReply(session: AgentSession, patientMessage: string): Promise<AgentReply> {
  if (session.closed) {
    // Defense in depth — the WhatsApp handler should drop further turns after
    // close, but if one slips through we restate the handoff instead of
    // re-engaging the model.
    return {
      text:      "Thank you for sharing all of that with me. I'm sending your information to our care team right now. Someone will be in touch with you shortly.",
      closed:    true,
      reason:    session.closeReason,
      latencyMs: 0,
    };
  }

  const system = getSystemPrompt(session.slug);
  if (!system) throw new Error(`no system prompt registered for slug "${session.slug}"`);

  // Append the patient turn BEFORE the model call so the history sent to
  // Claude includes the message being answered.
  session.exchanges.push({ role: "user", content: patientMessage });

  const userTurnCount = session.exchanges.filter(e => e.role === "user").length;
  const isFinalTurn   = userTurnCount >= MAX_USER_TURNS;

  // On the forced-close turn, append a sentence instructing the model to send
  // exactly the handoff phrase. The base prompt already specifies the wording,
  // but explicit reinforcement on the final turn protects against drift.
  const turnSystem = isFinalTurn
    ? `${system}\n\nFINAL TURN: send the fixed handoff message verbatim and nothing else.`
    : system;

  const startMs = Date.now();
  let text = "";

  // Build-verification log: prints the exact model ID on every patient turn
  // so the production server logs prove which code is actually running.
  console.log(`[StreamingAgent] turn=${userTurnCount} slug=${session.slug} model=${ANTHROPIC_MODEL} maxTokens=${MAX_OUTPUT_TOKENS}`);

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const stream = client().messages.stream({
      model:       ANTHROPIC_MODEL,
      max_tokens:  MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system:      turnSystem,
      messages:    session.exchanges,
    });

    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("agent stream timeout")),
        REQUEST_TIMEOUT_MS,
      );
    });

    // Accumulate text deltas. SDK helper exposes per-token events as well as
    // a finalMessage() — we read deltas to keep latency-to-first-token low.
    text = await Promise.race([
      (async () => {
        let acc = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            acc += event.delta.text;
          }
        }
        return acc;
      })(),
      timeout,
    ]);

    text = text.trim();
  } catch (e: any) {
    const isTimeout = e?.message === "agent stream timeout";
    // Full structured error dump so production logs reveal the actual cause
    // (model name typo, expired key, rate limit, region block, timeout, etc.).
    const errPayload = {
      where:        "streamingAgent.nextReply",
      slug:         session.slug,
      model:        ANTHROPIC_MODEL,
      userTurnCount,
      durationMs:   Date.now() - startMs,
      isTimeout,
      name:         e?.name,
      message:      e?.message,
      status:       e?.status,
      code:         e?.code,
      type:         e?.error?.error?.type ?? e?.error?.type,
      requestId:    e?.request_id ?? e?.headers?.["request-id"],
      anthropicErr: e?.error,
      stack:        typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : undefined,
    };
    console.error("[StreamingAgent] LLM call failed:", JSON.stringify(errPayload));

    // Timeout fallback: serve the next deterministic question from the
    // protocol sequence so the conversation keeps moving even when the
    // model is slow. This is the path that protects the 5s patient SLA.
    if (isTimeout) {
      const fallback = getFallbackQuestion(session.slug, userTurnCount);
      if (fallback) {
        session.exchanges.push({ role: "assistant", content: fallback });
        return { text: fallback, closed: false, latencyMs: Date.now() - startMs };
      }
    }

    // Non-timeout errors (or timeout past the end of the fallback list) take
    // the same close-floor split as before: retry below the floor, physician
    // handoff at/above.
    if (userTurnCount < MIN_USER_TURNS_BEFORE_CLOSE) {
      const retry = "Sorry, I'm having a brief connection issue. Could you tell me that again?";
      session.exchanges.push({ role: "assistant", content: retry });
      return { text: retry, closed: false, latencyMs: Date.now() - startMs };
    }
    text = "Thank you for sharing all of that with me. I'm sending your information to our care team right now. Someone will be in touch with you shortly.";
    session.exchanges.push({ role: "assistant", content: text });
    session.closed      = true;
    session.closedAt    = Date.now();
    session.closeReason = "model_closed";
    return { text, closed: true, reason: "model_closed", latencyMs: Date.now() - startMs };
  } finally {
    // Always clear the timeout — otherwise a fast success leaks a pending
    // setTimeout that will reject 8 s later into nothing.
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (!text) {
    // Empty model output (rare). Below the close floor we send a retry and
    // keep the session open; at/above the floor we hand off as fail-closed.
    if (userTurnCount < MIN_USER_TURNS_BEFORE_CLOSE) {
      const retry = "Sorry, I missed that — could you tell me again?";
      session.exchanges.push({ role: "assistant", content: retry });
      return { text: retry, closed: false, latencyMs: Date.now() - startMs };
    }
    text = "Thank you for sharing all of that with me. I'm sending your information to our care team right now. Someone will be in touch with you shortly.";
  }

  session.exchanges.push({ role: "assistant", content: text });

  // Close detection is gated by a minimum-turn floor. Below the floor we
  // ignore the close markers entirely — the model may emit the phrase in an
  // example, a quote, or a misread of the instructions, and we must keep the
  // interview going until enough information has been collected.
  const eligibleForClose = userTurnCount >= MIN_USER_TURNS_BEFORE_CLOSE;
  const matchedClose     = eligibleForClose && CLOSING_MARKERS.some(rx => rx.test(text));

  if (matchedClose || isFinalTurn) {
    session.closed      = true;
    session.closedAt    = Date.now();
    session.closeReason = matchedClose ? "model_closed" : "max_turns";
    return { text, closed: true, reason: session.closeReason, latencyMs: Date.now() - startMs };
  }

  return { text, closed: false, latencyMs: Date.now() - startMs };
}
