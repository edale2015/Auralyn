export interface ConversationMessage {
  id: string
  sender: "patient" | "doctor" | "system"
  text: string
  timestamp: string
  isAiDraft?: boolean
}

export interface TelemedicineSession {
  caseId: string
  startedAt: string
  updatedAt: string
  conversation: ConversationMessage[]
  patientMessages: string[]
  doctorNotes: string[]
  draftReply: string
  checkedSymptoms: string[]
  complaint?: string
  differential?: { diagnosis: string; confidence: number; reasoning?: string }[]
  disposition?: string
  redFlags: string[]
  safetyAlerts: string[]
  medicationSuggestions: string[]
  medicationAlerts: string[]
  icdCodes: { code: string; description: string }[]
  cptCodes: { code: string; description: string; rvu?: number }[]
  returnPrecautions: string[]
  dischargeInstructions?: string
  noteGenerated?: { hpi: string; assessment: string; plan: string; disposition: string }
  status: "active" | "completed" | "discharged"
  patientInfo?: { age?: number; sex?: string; allergies?: string[]; medications?: string[] }
}

const sessions: Record<string, TelemedicineSession> = {}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function createSession(
  caseId: string,
  patientInfo?: TelemedicineSession["patientInfo"]
): TelemedicineSession {
  sessions[caseId] = {
    caseId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    conversation: [],
    patientMessages: [],
    doctorNotes: [],
    draftReply: "",
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
  }
  return sessions[caseId]
}

export function getSession(caseId: string): TelemedicineSession {
  if (!sessions[caseId]) createSession(caseId)
  return sessions[caseId]
}

export function updateSession(
  caseId: string,
  patch: Partial<TelemedicineSession>
): TelemedicineSession {
  const s = getSession(caseId)
  Object.assign(s, patch, { updatedAt: new Date().toISOString() })
  return s
}

export function addPatientMessage(caseId: string, text: string): ConversationMessage {
  const s = getSession(caseId)
  const msg: ConversationMessage = {
    id: makeId(),
    sender: "patient",
    text,
    timestamp: new Date().toISOString(),
  }
  s.conversation.push(msg)
  s.patientMessages.push(text)
  s.updatedAt = new Date().toISOString()
  return msg
}

export function addDoctorMessage(caseId: string, text: string): ConversationMessage {
  const s = getSession(caseId)
  const msg: ConversationMessage = {
    id: makeId(),
    sender: "doctor",
    text,
    timestamp: new Date().toISOString(),
  }
  s.conversation.push(msg)
  s.doctorNotes.push(text)
  s.draftReply = ""
  s.updatedAt = new Date().toISOString()
  return msg
}

export function setDraftReply(caseId: string, draft: string): void {
  const s = getSession(caseId)
  s.draftReply = draft
  s.updatedAt = new Date().toISOString()
}

export function addSystemMessage(caseId: string, text: string): ConversationMessage {
  const s = getSession(caseId)
  const msg: ConversationMessage = {
    id: makeId(),
    sender: "system",
    text,
    timestamp: new Date().toISOString(),
  }
  s.conversation.push(msg)
  s.updatedAt = new Date().toISOString()
  return msg
}

export async function runBrainForSession(caseId: string): Promise<void> {
  const s = getSession(caseId);

  // Lazily import to avoid circular deps at module load time
  const { runClinicalBrain } = await import("../core/clinicalBrainEngine");

  // Map session data into the brain's expected format
  const differentialCandidates = (s.differential ?? []).map((d) => ({
    clusterId: d.diagnosis,
    score: d.confidence,
  }));

  const answers: Record<string, unknown> = {};
  for (const sym of s.checkedSymptoms) {
    answers[sym] = true;
  }

  // Minimal state stub for red-flag detection and similarity
  const stateStub: any = {
    chiefComplaint: s.complaint ?? "",
    answers,
    redFlags: s.redFlags,
    modifiers: {},
    demographics: {},
  };

  const brain = await runClinicalBrain({
    complaint: s.complaint ?? "",
    answers,
    state: stateStub,
    differentialCandidates,
    availableQuestions: [],
  });

  // Merge brain results back into the session
  const patch: Partial<TelemedicineSession> = {};

  if (brain.redFlags?.length) {
    patch.redFlags = [...new Set([...s.redFlags, ...brain.redFlags])];
  }
  if (brain.disposition) {
    patch.disposition = brain.disposition;
  }
  if (brain.differentials?.length) {
    patch.differential = brain.differentials.map((d) => ({
      diagnosis: d.clusterId,
      confidence: d.posteriorProbability,
      reasoning: d.evidenceFor.join(", ") || undefined,
    }));
  }

  if (Object.keys(patch).length > 0) {
    updateSession(caseId, patch);
  }
}

export function listActiveSessions(): TelemedicineSession[] {
  return Object.values(sessions)
    .filter((s) => s.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function listAllSessions(): TelemedicineSession[] {
  return Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function closeSession(
  caseId: string,
  status: "completed" | "discharged" = "discharged"
): void {
  const s = getSession(caseId)
  s.status = status
  s.updatedAt = new Date().toISOString()
}
