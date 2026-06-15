import { createHash } from "node:crypto";
import type { HotSession } from "./kbIntake";

// ─────────────────────────────────────────────────────────────────────────────
// Durable, cross-instance WhatsApp session store
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS
// kbIntake.ts keeps conversation state in a per-process in-memory Map
// (`hotSessions`). Under Replit autoscale (.replit: deploymentTarget =
// "autoscale") a patient's turn N+1 is not guaranteed to hit the same process
// — and a cold-started instance has an empty Map. The result is the WhatsApp
// "re-greeting" bug: the bot restarts the interview mid-conversation because it
// lost the session (including the full Claude agent history).
//
// This store mirrors the FULL resumable session to a shared backend so any
// instance can resume the same conversation.
//
// STORE CHOICE — Firestore, not Redis
// The session blob contains PHI (symptom answers, full patient conversation).
// Firestore is the existing PHI-bearing store (it already holds the case) and
// is the approved path. Upstash Redis is NOT BAA-confirmed (CLAUDE.md §6/§12),
// so we deliberately do not introduce a new PHI processor.
//
// PHI-SAFE KEYING
// The thread id is a phone number = PHI. It is NEVER used as a key. The doc id
// is a SHA-256 hash of the thread key. The PHI lives only inside the blob, in
// Firestore — never in a key, collection name, or log line.

const COLLECTION = "whatsappSessions";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — abandoned interviews expire on their own

// The persisted shape is the session minus `bundle`: the bundle is derived
// from `complaint.slug` and re-resolved on restore, so we never serialize it.
export type PersistedSession = Omit<HotSession, "bundle">;

export interface SessionBackend {
  get(docId: string): Promise<PersistedSession | null>;
  set(docId: string, value: PersistedSession): Promise<void>;
  del(docId: string): Promise<void>;
}

// ── Test backend injection ────────────────────────────────────────────────────
// Stored on globalThis so it SURVIVES vi.resetModules() — that is exactly how
// the two-instance / cold-start test simulates a second autoscale process: it
// resets the module graph (clearing kbIntake's Map) while the shared store,
// standing in for Firestore, persists. No production caller touches these.
const TEST_BACKEND_KEY = "__waSessionTestBackend__";
export function __setSessionBackendForTest(backend: SessionBackend | null): void {
  (globalThis as any)[TEST_BACKEND_KEY] = backend;
}
function activeTestBackend(): SessionBackend | null {
  return ((globalThis as any)[TEST_BACKEND_KEY] as SessionBackend | undefined) ?? null;
}

function docIdFor(threadId: string): string {
  return createHash("sha256").update(`whatsapp:${threadId}`).digest("hex");
}

// ── Firestore backend (production) ──────────────────────────────────────────────
async function firestoreBackend(): Promise<SessionBackend | null> {
  try {
    const { getFirestore } = await import("../firebase");
    const col = getFirestore().collection(COLLECTION);
    return {
      async get(docId) {
        const snap = await col.doc(docId).get();
        if (!snap.exists) return null;
        const data = snap.data() as { session?: PersistedSession; expiresAt?: number } | undefined;
        if (data?.expiresAt && data.expiresAt < Date.now()) return null;
        return data?.session ?? null;
      },
      async set(docId, value) {
        await col.doc(docId).set({ session: value, expiresAt: Date.now() + TTL_MS });
      },
      async del(docId) {
        await col.doc(docId).delete();
      },
    };
  } catch {
    return null;
  }
}

async function resolveBackend(): Promise<SessionBackend | null> {
  return activeTestBackend() ?? (await firestoreBackend());
}

// ── Public API ──────────────────────────────────────────────────────────────────
// All three are best-effort: a backend failure degrades to "no durable record"
// (i.e. the prior in-memory-only behavior) and never throws into a patient turn.

export async function loadSession(threadId: string): Promise<PersistedSession | null> {
  const backend = await resolveBackend();
  if (!backend) return null;
  try {
    return await backend.get(docIdFor(threadId));
  } catch (e: any) {
    console.error("[sessionStore] load failed:", e?.message ?? e);
    return null;
  }
}

export async function saveSession(threadId: string, session: HotSession): Promise<void> {
  const backend = await resolveBackend();
  if (!backend) return;
  const { bundle: _bundle, ...persisted } = session; // drop derived bundle
  try {
    await backend.set(docIdFor(threadId), persisted as PersistedSession);
  } catch (e: any) {
    console.error("[sessionStore] save failed:", e?.message ?? e);
  }
}

export async function deleteSession(threadId: string): Promise<void> {
  const backend = await resolveBackend();
  if (!backend) return;
  try {
    await backend.del(docIdFor(threadId));
  } catch (e: any) {
    console.error("[sessionStore] delete failed:", e?.message ?? e);
  }
}
