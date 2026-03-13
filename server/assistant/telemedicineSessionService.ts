export interface TelemedicineSession {
  caseId: string;
  startedAt: string;
  updatedAt: string;
  patientMessages: string[];
  doctorNotes: string[];
  checkedSymptoms: string[];
  complaint?: string;
  differential?: { diagnosis: string; confidence: number; reasoning?: string }[];
  disposition?: string;
  redFlags: string[];
  safetyAlerts: string[];
  medicationSuggestions: string[];
  medicationAlerts: string[];
  icdCodes: { code: string; description: string }[];
  cptCodes: { code: string; description: string; rvu?: number }[];
  returnPrecautions: string[];
  dischargeInstructions?: string;
  noteGenerated?: {
    hpi: string;
    assessment: string;
    plan: string;
    disposition: string;
  };
  status: "active" | "completed" | "discharged";
  patientInfo?: { age?: number; sex?: string; allergies?: string[]; medications?: string[] };
}

const sessions: Record<string, TelemedicineSession> = {};

export function createSession(caseId: string, patientInfo?: TelemedicineSession["patientInfo"]): TelemedicineSession {
  sessions[caseId] = {
    caseId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    patientMessages: [],
    doctorNotes: [],
    checkedSymptoms: [],
    redFlags: [],
    safetyAlerts: [],
    medicationSuggestions: [],
    medicationAlerts: [],
    icdCodes: [],
    cptCodes: [],
    returnPrecautions: [],
    status: "active",
    patientInfo,
  };
  return sessions[caseId];
}

export function getSession(caseId: string): TelemedicineSession {
  if (!sessions[caseId]) createSession(caseId);
  return sessions[caseId];
}

export function updateSession(caseId: string, patch: Partial<TelemedicineSession>): TelemedicineSession {
  const s = getSession(caseId);
  Object.assign(s, patch, { updatedAt: new Date().toISOString() });
  return s;
}

export function listActiveSessions(): TelemedicineSession[] {
  return Object.values(sessions).filter(s => s.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listAllSessions(): TelemedicineSession[] {
  return Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function closeSession(caseId: string, status: "completed" | "discharged" = "discharged"): void {
  const s = sessions[caseId];
  if (s) s.status = status;
}
