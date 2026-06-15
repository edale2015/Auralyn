import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard: a WhatsApp conversation must survive an autoscale instance
// boundary / cold start.
//
// ROOT CAUSE THIS LOCKS DOWN
// kbIntake.ts kept session state ONLY in a per-process in-memory Map. Under
// Replit autoscale (deploymentTarget = "autoscale") turn N+1 can land on a
// different / cold-started instance whose Map is empty, so the bot re-greets
// and restarts the interview. The fix mirrors the full session to a shared
// Firestore-backed store (server/whatsapp/sessionStore.ts).
//
// HOW WE SIMULATE TWO INSTANCES
// vi.resetModules() gives turn 2 a brand-new kbIntake module with a fresh, empty
// Map — exactly what a second autoscale process sees. A shared in-memory backend
// (registered on globalThis, so it survives resetModules) stands in for the
// Firestore both instances read. The kbIntake write-through + read-restore logic
// under test is the real production code; only the storage backend is a double
// (real Firestore is not available in unit/integration runs).
// ─────────────────────────────────────────────────────────────────────────────

const FROM = "whatsapp:+15557770999";
const E164 = "+15557770999";

function makeSharedBackend() {
  const docs = new Map<string, any>();
  return {
    docs,
    backend: {
      async get(id: string) { return docs.get(id) ?? null; },
      async set(id: string, v: any) { docs.set(id, v); },
      async del(id: string) { docs.delete(id); },
    },
  };
}

let shared: ReturnType<typeof makeSharedBackend>;

async function registerBackend() {
  const store = await import("../../server/whatsapp/sessionStore");
  store.__setSessionBackendForTest(shared.backend);
}

beforeEach(async () => {
  shared = makeSharedBackend();
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
  send.registerTestInterceptor(E164, (m: string) => captured.push(m));
  const { handleWhatsAppKBIntake } = await import("../../server/whatsapp/kbIntake");
  await handleWhatsAppKBIntake({ from: FROM, text: message, messageSid: `t-${message.slice(0, 6)}` });
  await new Promise((r) => setTimeout(r, 50)); // flush awaited inline sends
  send.clearTestInterceptor(E164);
  return captured;
}

describe("WhatsApp session survives an autoscale instance boundary", () => {
  it("turn 2 on a fresh instance (empty Map) resumes the interview — no re-greet", async () => {
    // ── Turn 1 on instance A: open a sore-throat interview ──
    const t1 = await runTurn("I have a really sore throat");
    expect(t1.join(" ")).toMatch(/sore throat/i);          // interview actually started
    expect(shared.docs.size).toBeGreaterThanOrEqual(1);    // full session was persisted durably

    // ── Simulate a SECOND autoscale instance / cold start ──
    // New module graph → fresh empty hotSessions Map. The shared backend
    // (Firestore stand-in) persists on globalThis across the reset.
    vi.resetModules();
    await registerBackend();

    // ── Turn 2 on instance B: an ordinary follow-up answer ──
    const t2 = await runTurn("since yesterday");
    const t2text = t2.join(" ");

    // It must continue the interview, not restart with the greeting.
    expect(t2text).not.toMatch(/bringing you in|I'm Auralyn|main symptom today/i);
  }, 30_000); // two real turns (~4s each) exceed the 5s default
});
