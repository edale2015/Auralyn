import { auditLog } from "../security/auditLogger";

export interface PatientSession {
  sessionId: string;
  patientId?: string;
  consentRequired: boolean;
  consentConfirmedAt?: string;
  status: "awaiting_consent" | "intake_ready" | "in_progress" | "completed" | "escalated";
  createdAt: string;
  complaint?: string;
  metadata?: Record<string, any>;
}

const activeSessions = new Map<string, PatientSession>();

export function startSession(patient: { patientId?: string; complaint?: string; metadata?: Record<string, any> }): PatientSession {
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const session: PatientSession = {
    sessionId,
    patientId: patient.patientId,
    consentRequired: true,
    status: "awaiting_consent",
    createdAt: new Date().toISOString(),
    complaint: patient.complaint,
    metadata: patient.metadata,
  };

  activeSessions.set(sessionId, session);

  auditLog({
    actor: "patient_self_service",
    action: "session_started",
    patientId: patient.patientId,
    entityType: "session",
    entityId: sessionId,
  });

  return session;
}

export function confirmConsent(sessionId: string): PatientSession | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  const updated: PatientSession = {
    ...session,
    consentRequired: false,
    consentConfirmedAt: new Date().toISOString(),
    status: "intake_ready",
  };

  activeSessions.set(sessionId, updated);

  auditLog({
    actor: "patient_self_service",
    action: "consent_confirmed",
    patientId: session.patientId,
    entityType: "session",
    entityId: sessionId,
  });

  return updated;
}

export function updateSessionStatus(sessionId: string, status: PatientSession["status"]): PatientSession | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  const updated = { ...session, status };
  activeSessions.set(sessionId, updated);
  return updated;
}

export function getSession(sessionId: string): PatientSession | null {
  return activeSessions.get(sessionId) ?? null;
}

export function listActiveSessions(): PatientSession[] {
  return [...activeSessions.values()].filter(s => s.status !== "completed");
}
