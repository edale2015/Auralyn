import { describe, it, expect, vi } from "vitest";

// V102 — Reproduce session loss across an instance boundary.
//
// kbIntake.ts stores conversation state ONLY in a module-level in-memory Map
// (`const hotSessions = new Map(...)`, kbIntake.ts:256). Under Replit autoscale
// (.replit: deploymentTarget = "autoscale") consecutive WhatsApp messages from
// one patient are not guaranteed to hit the same process, so turn 2 frequently
// lands on an instance whose Map is empty.
//
// We FORCE that condition with vi.resetModules() between turn 1 and turn 2:
// the second import gives a brand-new kbIntake module instance with a fresh,
// empty hotSessions Map — exactly what a second autoscale instance sees. The
// only cross-instance recovery is firestoreLookup() (kbIntake.ts:275-295),
// which here returns null (its feeding write is fire-and-forget; no creds in
// this env) — the same way it can miss in prod when the write hasn't landed
// within its 2s window.
//
// DESIRED behavior: turn 2 continues the SAME sore-throat interview. The
// assertion encodes that, so it FAILS — proving the session is lost.

const FROM = "whatsapp:+15557770123";
const E164 = "+15557770123";

async function runTurn(message: string): Promise<string[]> {
  const captured: string[] = [];
  const send = await import("../../server/whatsapp/send");
  send.registerTestInterceptor(E164, (msg: string) => captured.push(msg));
  const { handleWhatsAppKBIntake } = await import("../../server/whatsapp/kbIntake");
  await handleWhatsAppKBIntake({ from: FROM, text: message, messageSid: `t-${message.slice(0, 6)}` });
  // allow any awaited inline sends to flush
  await new Promise((r) => setTimeout(r, 50));
  return captured;
}

describe("V102: in-memory session must survive an instance boundary", () => {
  it("turn 2 (fresh instance, empty Map) should continue the sore-throat interview, not re-greet", async () => {
    // ── Turn 1: open a sore-throat session on instance A ──
    const t1 = await runTurn("I have a really sore throat");
    console.log("\n===== V102 TURN 1 (instance A) =====");
    console.log("patient> I have a really sore throat");
    t1.forEach((m) => console.log("auralyn>", JSON.stringify(m)));

    // ── Simulate autoscale: next message lands on a FRESH process ──
    vi.resetModules(); // new kbIntake module => new empty hotSessions Map

    // ── Turn 2: ordinary follow-up answer on instance B ──
    const t2 = await runTurn("since yesterday");
    console.log("\n===== V102 TURN 2 (instance B — Map cleared) =====");
    console.log("patient> since yesterday");
    t2.forEach((m) => console.log("auralyn>", JSON.stringify(m)));
    console.log("====================================\n");

    const t2text = t2.join(" ");
    // DESIRED: must NOT re-greet / restart intake on a follow-up.
    expect(t2text).not.toMatch(/bringing you in|I'm Auralyn|main symptom today/i);
  });
});
