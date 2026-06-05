import { describe, it, expect } from "vitest";

// V104 — Measure first-turn latency for an agent slug (neuro_headache) on a
// COLD process (no prewarm has run) vs a WARM one (connection established).
//
// The live turn uses client().messages.stream(...) (streamingAgent.ts:159),
// while the startup prewarm uses client().messages.create(...) (streamingAgent.ts:74)
// — so the prewarm warms a DIFFERENT endpoint than the live path.
//
// Acceptance asks: cold first-follow-up should be > 15s. We measure honestly
// and assert that. Per the session HARD RULE, if it does NOT reproduce > 15s we
// REPORT the gap rather than adjust the threshold.
describe("V104: cold first-turn latency for the streaming-agent path", () => {
  it("measures cold vs warm nextReply latency (real Anthropic call)", async () => {
    const { startAgentSession, nextReply } = await import(
      "../../server/whatsapp/agent/streamingAgent"
    );

    // COLD: brand-new process state, no prewarmAnthropicConnection() called.
    const coldSession = startAgentSession("neuro_headache");
    expect(coldSession).not.toBeNull();
    const c0 = Date.now();
    const coldReply = await nextReply(coldSession!, "I have a really bad headache");
    const coldMs = Date.now() - c0;

    // WARM: connection now established; second turn.
    const warmSession = startAgentSession("neuro_headache");
    const w0 = Date.now();
    const warmReply = await nextReply(warmSession!, "I have a really bad headache");
    const warmMs = Date.now() - w0;

    console.log("\n===== V104 LATENCY =====");
    console.log("COLD nextReply ms:", coldMs, "| reply:", JSON.stringify(coldReply.text).slice(0, 80));
    console.log("WARM nextReply ms:", warmMs, "| reply:", JSON.stringify(warmReply.text).slice(0, 80));
    console.log("internal cap REQUEST_TIMEOUT_MS = 8000 (streamingAgent.ts:33)");
    console.log("prewarm endpoint: messages.create (streamingAgent.ts:74)");
    console.log("live endpoint:    messages.stream (streamingAgent.ts:159)");
    console.log("========================\n");

    // Acceptance threshold. If this FAILS because nextReply is capped at ~8s,
    // that is the reported gap — do NOT lower the threshold.
    expect(coldMs).toBeGreaterThan(15000);
  }, 90_000);
});
