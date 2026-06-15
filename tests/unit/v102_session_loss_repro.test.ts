import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// V102 — Session loss across an instance boundary (now FIXED).
//
// kbIntake.ts used to store conversation state ONLY in a module-level in-memory
// Map. Under Replit autoscale (.replit: deploymentTarget = "autoscale")
// consecutive WhatsApp messages from one patient are not guaranteed to hit the
// same process, so turn 2 frequently lands on an instance whose Map is empty —
// the WhatsApp "re-greeting" bug.
//
// We FORCE that condition with vi.resetModules() between turn 1 and turn 2: the
// second import gives a brand-new kbIntake module with a fresh, empty Map —
// exactly what a second autoscale instance sees.
//
// THE FIX: kbIntake now mirrors the full session to a shared Firestore-backed
// store (server/whatsapp/sessionStore.ts). Here an in-memory backend registered
// on globalThis stands in for Firestore (real Firestore is unavailable in unit
// runs) and survives resetModules, so turn 2 resumes the SAME interview.
// The assertion that previously FAILED (re-greet) now PASSES.

const FROM = "whatsapp:+15557770123";
const E164 = "+15557770123";

const docs = new Map<string, any>();
const sharedBackend = {
  async get(id: string) { return docs.get(id) ?? null; },
  async set(id: string, v: any) { docs.set(id, v); },
  async del(id: string) { docs.delete(id); },
};

async function registerBackend() {
  const store = await import("../../server/whatsapp/sessionStore");
  store.__setSessionBackendForTest(sharedBackend);
}

beforeEach(async () => {
  docs.clear();
  await registerBackend();
});

afterEach(async () => {
  const store = await import("../../server/whatsapp/sessionStore");
  store.__setSessionBackendForTest(null);
  vi.resetModules();
});

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
    await registerBackend(); // shared Firestore stand-in both instances read

    // ── Turn 2: ordinary follow-up answer on instance B ──
    const t2 = await runTurn("since yesterday");
    console.log("\n===== V102 TURN 2 (instance B — Map cleared) =====");
    console.log("patient> since yesterday");
    t2.forEach((m) => console.log("auralyn>", JSON.stringify(m)));
    console.log("====================================\n");

    const t2text = t2.join(" ");
    // DESIRED: must NOT re-greet / restart intake on a follow-up.
    expect(t2text).not.toMatch(/bringing you in|I'm Auralyn|main symptom today/i);
  }, 30_000); // two real turns (~4s each) exceed the 5s default
});
