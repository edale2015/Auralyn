import { db } from "../db";
import { patientSessions } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

export interface PatientSession {
  id: string;
  status: "pending" | "approved" | "overridden" | "escalated";
  complaint?: string;
  age?: number;
  disposition?: string;
  riskLevel?: string;
  safetyFlags?: string[];
  override?: Record<string, any>;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cache = new Map<string, PatientSession>();

function rowToSession(row: any): PatientSession {
  const extra = (row.overrideData ?? {}) as Record<string, any>;
  return {
    id: row.id,
    status: row.status as PatientSession["status"],
    riskLevel: row.riskLevel ?? undefined,
    safetyFlags: Array.isArray(row.safetyFlags) ? row.safetyFlags : [],
    disposition: typeof row.disposition === "string" ? row.disposition : (extra.disposition ?? undefined),
    approvedBy: row.approvedBy ?? undefined,
    override: extra.override ?? undefined,
    complaint: extra.complaint ?? undefined,
    age: extra.age ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function sessionToRow(session: PatientSession) {
  return {
    id: session.id,
    status: session.status,
    riskLevel: session.riskLevel ?? null,
    safetyFlags: session.safetyFlags ?? [],
    disposition: session.disposition ? { value: session.disposition } : null,
    approvedBy: session.approvedBy ?? null,
    overrideData: {
      override: session.override ?? null,
      complaint: session.complaint ?? null,
      age: session.age ?? null,
      disposition: session.disposition ?? null,
    },
    updatedAt: session.updatedAt,
  };
}

export async function loadSessionsFromDB(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(patientSessions)
      .orderBy(desc(patientSessions.createdAt))
      .limit(500);
    for (const row of rows) {
      const s = rowToSession(row);
      cache.set(s.id, s);
    }
    console.log(`[SessionStore] Loaded ${rows.length} sessions from DB into cache`);
  } catch (e: any) {
    console.error("[SessionStore] loadSessionsFromDB error:", e?.message);
  }
}

export function createSession(id: string, data: Partial<PatientSession>): PatientSession {
  const session: PatientSession = {
    id,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
  cache.set(id, session);
  db.insert(patientSessions)
    .values(sessionToRow(session))
    .onConflictDoNothing()
    .catch((e: any) => console.error("[SessionStore] persist create error:", e?.message));
  return session;
}

export function updateSession(id: string, update: Partial<PatientSession>): PatientSession | null {
  const existing = cache.get(id);
  if (!existing) return null;
  const updated: PatientSession = { ...existing, ...update, updatedAt: new Date() };
  cache.set(id, updated);
  const row = sessionToRow(updated);
  db.update(patientSessions)
    .set({
      status: row.status,
      riskLevel: row.riskLevel,
      safetyFlags: row.safetyFlags,
      disposition: row.disposition,
      approvedBy: row.approvedBy,
      overrideData: row.overrideData,
      updatedAt: row.updatedAt,
    })
    .where(eq(patientSessions.id, id))
    .catch((e: any) => console.error("[SessionStore] persist update error:", e?.message));
  return updated;
}

export function getSession(id: string): PatientSession | undefined {
  return cache.get(id);
}

export function getAllSessions(): PatientSession[] {
  return Array.from(cache.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function deleteSession(id: string): boolean {
  const had = cache.delete(id);
  if (had) {
    db.delete(patientSessions)
      .where(eq(patientSessions.id, id))
      .catch((e: any) => console.error("[SessionStore] persist delete error:", e?.message));
  }
  return had;
}

export function seedDemoSessions(): void {
  if (cache.size > 0) return;
  const demos = [
    { id: "pt-001", complaint: "sore-throat", age: 32, riskLevel: "low", status: "pending" as const },
    { id: "pt-002", complaint: "chest-pain", age: 67, riskLevel: "high", status: "pending" as const, safetyFlags: ["High-risk chest pain: age >50"] },
    { id: "pt-003", complaint: "fever", age: 8, riskLevel: "medium", status: "approved" as const },
  ];
  for (const d of demos) createSession(d.id, d);
}
