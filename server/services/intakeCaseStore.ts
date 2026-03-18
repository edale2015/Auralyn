import { Disposition, TreatmentPlan } from "../engines/autoPlanEngine";
import { PatientMessage, SymptomAnswer } from "../engines/smartIntakeEngine";

export type QueueStatus = "new" | "auto_resolved" | "needs_review" | "approved" | "modified" | "escalated" | "closed";

export interface StructuredIntakeCase {
  id: string;
  patientId: string;
  source: "sms" | "whatsapp" | "web";
  chiefComplaint: string;
  age?: number;
  sex?: string;
  symptomDuration?: string;
  answers: SymptomAnswer[];
  transcript: PatientMessage[];
  redFlags: string[];
  missingCriticalData: string[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  confidenceScore: number;
  differential: Array<{ diagnosis: string; probability: number }>;
  proposedDisposition: Disposition;
  proposedPlan: TreatmentPlan | null;
  reviewReason?: string;
  queuePriority: number;
  queueStatus: QueueStatus;
  approvedBy?: string;
  approvedAt?: string;
  overrideNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomeRecord {
  caseId: string;
  outcomeType: "resolved" | "improved" | "unchanged" | "worsened" | "er_visit" | "hospitalized" | "complaint";
  npsScore?: number;
  patientComment?: string;
  collectedAt: string;
}

const cases = new Map<string, StructuredIntakeCase>();
const outcomes: OutcomeRecord[] = [];

function seedDemoCases() {
  const now = new Date().toISOString();
  const demoData: StructuredIntakeCase[] = [
    {
      id: "intake-001", patientId: "pat-101", source: "whatsapp", chiefComplaint: "cough",
      age: 34, sex: "male", symptomDuration: "3 days",
      answers: [{ key: "age", value: 34 }, { key: "sex", value: "male" }, { key: "duration", value: "3 days" }],
      transcript: [{ role: "patient", text: "I'm a 34 year old male with a cough for 3 days", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 8, riskLevel: "low", confidenceScore: 0.9,
      differential: [{ diagnosis: "viral_uri", probability: 0.82 }],
      proposedDisposition: "self_care",
      proposedPlan: { summary: "Viral URI - supportive care", diagnosisLabel: "Viral URI", meds: [{ name: "Acetaminophen", dose: "per label", instructions: "As needed for fever" }], homeCare: ["Hydration", "Rest"], followUp: ["Follow up if not improving"], returnPrecautions: ["Trouble breathing", "High fever"], patientMessage: "Likely viral URI. Rest and hydrate." },
      queuePriority: 40, queueStatus: "auto_resolved", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-002", patientId: "pat-102", source: "sms", chiefComplaint: "urinary burning",
      age: 28, sex: "female", symptomDuration: "2 days",
      answers: [{ key: "age", value: 28 }, { key: "sex", value: "female" }],
      transcript: [{ role: "patient", text: "28 year old female, burning when I urinate for 2 days", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 30, riskLevel: "medium", confidenceScore: 0.75,
      differential: [{ diagnosis: "acute_simple_cystitis", probability: 0.84 }],
      proposedDisposition: "telemed_now",
      proposedPlan: { summary: "Possible uncomplicated UTI", diagnosisLabel: "Possible UTI", meds: [{ name: "Nitrofurantoin", dose: "100 mg", instructions: "BID x 5 days if confirmed" }], homeCare: ["Hydration"], followUp: ["Reassess in 48h"], returnPrecautions: ["Fever", "Back pain"], patientMessage: "Possible bladder infection, clinician will confirm." },
      reviewReason: "medication_review_required",
      queuePriority: 280, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-003", patientId: "pat-103", source: "whatsapp", chiefComplaint: "rash",
      age: 5, sex: "male", symptomDuration: "1 days",
      answers: [{ key: "age", value: 5 }, { key: "sex", value: "male" }],
      transcript: [{ role: "patient", text: "My 5 year old boy has a rash since yesterday", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 18, riskLevel: "low", confidenceScore: 0.7,
      differential: [{ diagnosis: "contact_dermatitis", probability: 0.5 }, { diagnosis: "viral_exanthem", probability: 0.25 }],
      proposedDisposition: "office_followup",
      proposedPlan: { summary: "Non-emergent rash", diagnosisLabel: "Likely non-emergent rash", meds: [], homeCare: ["Gentle moisturizer", "Avoid scratching"], followUp: ["Schedule if persistent"], returnPrecautions: ["Mouth sores", "Breathing difficulty"], patientMessage: "Rash appears non-emergent. Monitor for worsening." },
      queuePriority: 90, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-004", patientId: "pat-104", source: "sms", chiefComplaint: "chest pain",
      age: 62, sex: "male", symptomDuration: "1 days",
      answers: [{ key: "age", value: 62 }, { key: "sex", value: "male" }],
      transcript: [{ role: "patient", text: "62 year old male, chest pain since this morning", at: now }],
      redFlags: ["chest_pain"], missingCriticalData: [],
      riskScore: 92, riskLevel: "critical", confidenceScore: 0.65,
      differential: [{ diagnosis: "red_flag_condition", probability: 0.95 }],
      proposedDisposition: "er_now",
      proposedPlan: { summary: "Red flag - emergency evaluation", diagnosisLabel: "Possible emergency", meds: [], homeCare: [], followUp: ["Go to ER now"], returnPrecautions: ["Do not wait"], patientMessage: "Go to the emergency room now." },
      reviewReason: "red_flags_detected",
      queuePriority: 1960, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-005", patientId: "pat-105", source: "web", chiefComplaint: "sore throat",
      age: 19, sex: "female", symptomDuration: "2 days",
      answers: [{ key: "age", value: 19 }, { key: "sex", value: "female" }, { key: "duration", value: "2 days" }],
      transcript: [{ role: "patient", text: "19 year old female, sore throat for 2 days", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 10, riskLevel: "low", confidenceScore: 0.85,
      differential: [{ diagnosis: "viral_pharyngitis", probability: 0.65 }, { diagnosis: "streptococcal_pharyngitis", probability: 0.25 }],
      proposedDisposition: "telemed_now",
      proposedPlan: { summary: "Sore throat needs strep eval", diagnosisLabel: "Pharyngitis", meds: [{ name: "Ibuprofen", dose: "per label", instructions: "For pain" }], homeCare: ["Warm fluids", "Salt water gargle"], followUp: ["Strep test if persists"], returnPrecautions: ["Difficulty swallowing", "Neck swelling"], patientMessage: "Your sore throat should be evaluated. Strep test may be needed." },
      reviewReason: "medication_review_required",
      queuePriority: 250, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-006", patientId: "pat-106", source: "whatsapp", chiefComplaint: "refill",
      age: 45, sex: "female",
      answers: [{ key: "age", value: 45 }, { key: "sex", value: "female" }],
      transcript: [{ role: "patient", text: "45 year old female, need my blood pressure med refill", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 0, riskLevel: "low", confidenceScore: 0.9,
      differential: [{ diagnosis: "medication_refill_request", probability: 0.98 }],
      proposedDisposition: "office_followup",
      proposedPlan: { summary: "Medication refill request", diagnosisLabel: "Refill request", meds: [], homeCare: [], followUp: ["Pharmacy verification"], returnPrecautions: [], patientMessage: "Refill request received and being reviewed." },
      queuePriority: 0, queueStatus: "auto_resolved", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-007", patientId: "pat-107", source: "sms", chiefComplaint: "abdominal pain",
      age: 78, sex: "female", symptomDuration: "2 days",
      answers: [{ key: "age", value: 78 }, { key: "sex", value: "female" }],
      transcript: [{ role: "patient", text: "78 year old female with abdominal pain for 2 days", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 52, riskLevel: "medium", confidenceScore: 0.6,
      differential: [{ diagnosis: "undifferentiated_complaint", probability: 0.5 }],
      proposedDisposition: "telemed_now",
      proposedPlan: null,
      reviewReason: "unsupported_complaint_pathway",
      queuePriority: 360, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
    {
      id: "intake-008", patientId: "pat-108", source: "web", chiefComplaint: "ear pain",
      age: 7, sex: "male", symptomDuration: "1 days",
      answers: [{ key: "age", value: 7 }, { key: "sex", value: "male" }],
      transcript: [{ role: "patient", text: "My 7 year old son has ear pain since yesterday", at: now }],
      redFlags: [], missingCriticalData: [],
      riskScore: 10, riskLevel: "low", confidenceScore: 0.7,
      differential: [{ diagnosis: "acute_otitis_media", probability: 0.6 }, { diagnosis: "otitis_externa", probability: 0.3 }],
      proposedDisposition: "telemed_now",
      proposedPlan: { summary: "Ear pain likely otitis media", diagnosisLabel: "Possible otitis media", meds: [], homeCare: ["Warm compress", "Acetaminophen per label"], followUp: ["Clinician evaluation needed"], returnPrecautions: ["High fever", "Drainage from ear"], patientMessage: "Ear pain needs evaluation. A clinician will review shortly." },
      reviewReason: "unsupported_complaint_pathway",
      queuePriority: 220, queueStatus: "needs_review", createdAt: now, updatedAt: now,
    },
  ];
  demoData.forEach((c) => cases.set(c.id, c));

  const demoOutcomes: OutcomeRecord[] = [
    { caseId: "intake-001", outcomeType: "resolved", npsScore: 9, patientComment: "Very helpful", collectedAt: now },
    { caseId: "intake-002", outcomeType: "improved", npsScore: 8, patientComment: "Quick response", collectedAt: now },
    { caseId: "intake-006", outcomeType: "resolved", npsScore: 10, patientComment: "Easy refill process", collectedAt: now },
    { caseId: "intake-003", outcomeType: "unchanged", npsScore: 6, patientComment: "Still waiting for follow-up", collectedAt: now },
    { caseId: "intake-005", outcomeType: "worsened", npsScore: 4, patientComment: "Got worse, went to doctor", collectedAt: now },
    { caseId: "intake-004", outcomeType: "er_visit", npsScore: 7, patientComment: "ER visit confirmed chest issue", collectedAt: now },
  ];
  demoOutcomes.forEach((o) => outcomes.push(o));
}

seedDemoCases();

export const intakeCaseStore = {
  saveCase(input: StructuredIntakeCase) {
    cases.set(input.id, input);
    return input;
  },
  getCase(id: string) {
    return cases.get(id) || null;
  },
  listCases() {
    return Array.from(cases.values());
  },
  updateCase(id: string, patch: Partial<StructuredIntakeCase>) {
    const current = cases.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    cases.set(id, next);
    return next;
  },
  saveOutcome(record: OutcomeRecord) {
    outcomes.push(record);
    return record;
  },
  listOutcomes() {
    return [...outcomes];
  },
};
