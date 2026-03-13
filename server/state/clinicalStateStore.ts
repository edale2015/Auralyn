import * as fs from "fs/promises";
import * as path from "path";

export type ClinicalEventType =
  | "SESSION_STARTED"
  | "PATIENT_MESSAGE"
  | "SYMPTOMS_RECORDED"
  | "COMPLAINT_IDENTIFIED"
  | "MODIFIER_CAPTURED"
  | "RED_FLAG_DETECTED"
  | "DIFFERENTIAL_UPDATED"
  | "ALERTS_UPDATED"
  | "SCORE_COMPUTED"
  | "MEDICATION_PLAN"
  | "DISPOSITION_SET"
  | "PATHWAY_EXECUTED"
  | "COPILOT_SUGGESTION"
  | "RISK_ASSESSED"
  | "HYBRID_REASONING_COMPLETE"
  | "UNCERTAINTY_DETECTED"
  | "FOLLOW_UP_QUESTION_ASKED"
  | "FOLLOWUP_QUESTION_SUGGESTED"
  | "FOLLOWUP_QUESTION_ANSWERED"
  | "CARE_PATHWAY_STARTED"
  | "DISCHARGE_READY"
  | "NOTE_READY"
  | "OUTCOME_RECORDED"
  | "REWARD_COMPUTED";

export interface ClinicalEvent {
  type: ClinicalEventType;
  timestamp: string;
  data: Record<string, any>;
}

export interface ClinicalState {
  caseId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  patient?: {
    age?: number;
    sex?: string;
    weight?: number;
    allergies?: string[];
    comorbidities?: string[];
    medications?: string[];
  };
  symptoms?: string;
  complaint?: string;
  modifiers?: Record<string, any>;
  structuredFacts?: Record<string, any>;
  redFlags?: string[];
  differential?: { diagnosis: string; confidence: number }[];
  scores?: Record<string, number>;
  disposition?: string;
  pathway?: any;
  riskAssessment?: {
    admissionRisk: string;
    deteriorationRisk: string;
    riskScore: number;
    factors: string[];
  };
  copilotSuggestions?: string[];
  followUpQuestions?: string[];
  alerts?: string[];
  medicationPlan?: {
    drug: string;
    dose: string;
    route: string;
    frequency: string;
    duration: string;
  } | null;
  dischargeText?: string;
  chartNote?: any;
  hybridResult?: {
    disposition: string;
    confidence: number;
    topDiagnosis: string;
    uncertaintyScore: number;
    triggered_flags: string[];
    explanation: string;
    reasoning_path: string[];
  };
  lastHybridEvalAt?: string;
  orchestratorRunAt?: string;
  pendingQuestion?: { id: string; text: string; complaint: string; targetFeature: string; expectedAnswerType: string; choices?: string[] } | null;
  answeredQuestionIds?: string[];
  answeredQuestions?: { questionId: string; answer: string; featuresExtracted: string[] }[];
  interviewComplete?: boolean;
  carePathway?: any;
  outcomeData?: {
    actualDisposition?: string;
    followupStatus?: string;
    reward?: number;
  };
  events: ClinicalEvent[];
  intakeMessages?: { role: "patient" | "system"; content: string; timestamp: string }[];
}

const store: Record<string, ClinicalState> = {};
const STATE_DIR = path.join(process.cwd(), "clinical_states");

async function ensureDir() {
  try { await fs.mkdir(STATE_DIR, { recursive: true }); } catch {}
}

function makeState(caseId: string): ClinicalState {
  return {
    caseId,
    sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    intakeMessages: [],
  };
}

export function getClinicalState(caseId: string): ClinicalState {
  if (!store[caseId]) {
    store[caseId] = makeState(caseId);
  }
  return store[caseId];
}

export function setClinicalState(caseId: string, patch: Partial<ClinicalState>): ClinicalState {
  const state = getClinicalState(caseId);
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  persistState(caseId).catch(() => {});
  return state;
}

export function listActiveSessions(): { caseId: string; complaint?: string; updatedAt: string }[] {
  return Object.values(store).map(s => ({ caseId: s.caseId, complaint: s.complaint, updatedAt: s.updatedAt })).slice(0, 100);
}

export function clearState(caseId: string): void {
  delete store[caseId];
}

async function persistState(caseId: string): Promise<void> {
  try {
    await ensureDir();
    await fs.writeFile(path.join(STATE_DIR, `${caseId}.json`), JSON.stringify(store[caseId], null, 2));
  } catch {}
}

export async function loadPersistedState(caseId: string): Promise<ClinicalState | null> {
  try {
    await ensureDir();
    const raw = await fs.readFile(path.join(STATE_DIR, `${caseId}.json`), "utf8");
    const state = JSON.parse(raw) as ClinicalState;
    store[caseId] = state;
    return state;
  } catch {
    return null;
  }
}
