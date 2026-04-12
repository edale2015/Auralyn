import { randomUUID } from "crypto";
import type { ClinicalMessage } from "../context/compression";

export interface ClinicalSession {
  id:          string;
  patientId:   string;
  complaint:   string;
  messages:    ClinicalMessage[];
  state:       Record<string, unknown>;
  status:      "active" | "complete" | "physician_review" | "abandoned";
  createdAt:   Date;
  updatedAt:   Date;
}

const _sessions: Map<string, ClinicalSession> = new Map();

export async function createSession(input: {
  patientId: string;
  complaint:  string;
  initialState?: Record<string, unknown>;
}): Promise<ClinicalSession> {
  const session: ClinicalSession = {
    id:        randomUUID(),
    patientId: input.patientId,
    complaint:  input.complaint,
    messages:  [
      {
        role:    "system",
        content: `Clinical session for complaint: ${input.complaint}. Patient ID: ${input.patientId}. Follow evidence-based clinical pathways.`,
      },
    ],
    state:     input.initialState ?? {},
    status:    "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  _sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): ClinicalSession | undefined {
  return _sessions.get(sessionId);
}

export function updateSession(
  sessionId: string,
  updates: Partial<ClinicalSession>
): ClinicalSession | undefined {
  const session = _sessions.get(sessionId);
  if (!session) return undefined;

  Object.assign(session, updates, { updatedAt: new Date() });
  return session;
}

export function closeSession(
  sessionId: string,
  status: ClinicalSession["status"] = "complete"
): boolean {
  const session = _sessions.get(sessionId);
  if (!session) return false;
  session.status    = status;
  session.updatedAt = new Date();
  return true;
}

export function listActiveSessions(): ClinicalSession[] {
  return [..._sessions.values()].filter((s) => s.status === "active");
}

export function listPendingReviews(): ClinicalSession[] {
  return [..._sessions.values()].filter((s) => s.status === "physician_review");
}
