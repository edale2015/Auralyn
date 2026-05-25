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
import { getSystemPrompt, hasSystemPrompt } from "./prompts/registry";

const ANTHROPIC_MODEL  = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 350;
const MAX_USER_TURNS    = 15;            // force-close after this many patient messages
const REQUEST_TIMEOUT_MS = 30_000;       // hard ceiling so a stalled stream cannot hang the webhook

// The exact closing phrase the prompt instructs the model to emit. Matching
// any of these substrings (case-insensitive) flips the session to closed.
const CLOSING_MARKERS: RegExp[] = [
  /sending your information to our care team/i,
  /in touch with you shortly/i,
];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
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

  try {
    const stream = client().messages.stream({
      model:      ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system:     turnSystem,
      messages:   session.exchanges,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("agent stream timeout")), REQUEST_TIMEOUT_MS),
    );

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
    console.warn(`[StreamingAgent] LLM call failed (${e?.message}); sending handoff message`);
    // Fail-closed clinically: if the model is unreachable we hand the case
    // off to the physician immediately rather than guessing.
    text = "Thank you for sharing all of that with me. I'm sending your information to our care team right now. Someone will be in touch with you shortly.";
    session.exchanges.push({ role: "assistant", content: text });
    session.closed      = true;
    session.closedAt    = Date.now();
    session.closeReason = "model_closed";
    return { text, closed: true, reason: "model_closed", latencyMs: Date.now() - startMs };
  }

  if (!text) {
    // Empty model output (rare) — same fail-closed handoff.
    text = "Thank you for sharing all of that with me. I'm sending your information to our care team right now. Someone will be in touch with you shortly.";
  }

  session.exchanges.push({ role: "assistant", content: text });

  const matchedClose = CLOSING_MARKERS.some(rx => rx.test(text));
  if (matchedClose || isFinalTurn) {
    session.closed      = true;
    session.closedAt    = Date.now();
    session.closeReason = matchedClose ? "model_closed" : "max_turns";
    return { text, closed: true, reason: session.closeReason, latencyMs: Date.now() - startMs };
  }

  return { text, closed: false, latencyMs: Date.now() - startMs };
}
