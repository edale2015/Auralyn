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

const sessions = new Map<string, PatientSession>();

export function createSession(id: string, data: Partial<PatientSession>): PatientSession {
  const session: PatientSession = {
    id,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
  sessions.set(id, session);
  return session;
}

export function updateSession(id: string, update: Partial<PatientSession>): PatientSession | null {
  const existing = sessions.get(id);
  if (!existing) return null;
  const updated: PatientSession = { ...existing, ...update, updatedAt: new Date() };
  sessions.set(id, updated);
  return updated;
}

export function getSession(id: string): PatientSession | undefined {
  return sessions.get(id);
}

export function getAllSessions(): PatientSession[] {
  return Array.from(sessions.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function seedDemoSessions(): void {
  if (sessions.size > 0) return;
  const demos = [
    { id: "pt-001", complaint: "sore-throat", age: 32, riskLevel: "low", status: "pending" as const },
    { id: "pt-002", complaint: "chest-pain", age: 67, riskLevel: "high", status: "pending" as const, safetyFlags: ["High-risk chest pain: age >50"] },
    { id: "pt-003", complaint: "fever", age: 8, riskLevel: "medium", status: "approved" as const },
  ];
  for (const d of demos) createSession(d.id, d);
}
