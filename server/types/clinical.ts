export type RiskLevel = "low" | "moderate" | "high" | "critical";

// ─── Workflow State ────────────────────────────────────────────────────────────

export interface ClinicalVitals {
  tempF?:      number;
  spo2?:       number;
  hr?:         number;
  rr?:         number;
  systolicBP?: number;
  diastolicBP?: number;
}

export interface ClinicalSymptoms {
  fever?:       boolean;
  sob?:         boolean;
  chestPain?:   boolean;
  confusion?:   boolean;
  chills?:      boolean;
  durationDays?: number;
  [key: string]: boolean | number | undefined;
}

export interface ClinicalWorkflowInput {
  patientId:  string;
  complaint:  string;
  age?:       number;
  vitals?:    ClinicalVitals;
  symptoms?:  ClinicalSymptoms;
  [key: string]: unknown;
}

export interface ClinicalWorkflowState extends ClinicalWorkflowInput {
  traceId?:         string;
  traceSummary?:    string;
  intakeComplete?:  boolean;
  nextQuestion?:    string;
  diagnosis?:       string;
  diagnosisCandidates?: Array<{ name: string; probability: number }>;
  confidence?:      number;
  riskLevel?:       RiskLevel;
  disposition?:     string;
  documented?:      boolean;
  councilOpinion?:  SpecialistCouncilResult;
  monitoring?:      MonitoringAssessment;
}

// ─── Golden Cases ──────────────────────────────────────────────────────────────

export interface GoldenCaseDef {
  id:       string;
  title:    string;
  complaint: string;
  input:    ClinicalWorkflowInput;
  expected: {
    diagnosis?:         string;
    diagnosisIncludes?: string[];
    disposition?:       string;
    riskLevel?:         RiskLevel;
    minConfidence?:     number;
  };
  tags?:   string[];
  active:  boolean;
}

export interface GoldenCaseRunResult {
  caseId:     string;
  passed:     boolean;
  actual:     Partial<ClinicalWorkflowState>;
  mismatches: string[];
  traceId?:   string;
  runAt:      string;
}

// ─── RLHF ─────────────────────────────────────────────────────────────────────

export interface RLHFFeedbackEvent {
  id:                    string;
  traceId?:              string;
  caseId?:               string;
  complaint:             string;
  predictedDiagnosis?:   string;
  finalDiagnosis?:       string;
  predictedDisposition?: string;
  finalDisposition?:     string;
  physicianAgreement:    boolean;
  safetyIssue:           boolean;
  notes?:                string;
  createdAt:             string;
}

export interface RLHFProposal {
  id:                    string;
  complaint:             string;
  targetType:            "diagnosis_weight" | "disposition_threshold" | "question_priority";
  targetKey:             string;
  currentValue:          number;
  proposedValue:         number;
  reason:                string;
  evidenceCount:         number;
  requiresPhysicianReview: boolean;
  status:                "pending" | "approved" | "rejected" | "applied";
  createdAt:             string;
}

// ─── Specialist Council ────────────────────────────────────────────────────────

export interface SpecialistVote {
  specialty:      "cardiology" | "infectious_disease" | "icu";
  recommendation: {
    diagnosis?:   string;
    disposition?: string;
    riskLevel?:   RiskLevel;
  };
  confidence:   number;
  rationale:    string[];
  redFlags:     string[];
}

export interface SpecialistCouncilResult {
  votes:     SpecialistVote[];
  consensus: {
    diagnosis?:              string;
    disposition?:            string;
    riskLevel?:              RiskLevel;
    confidence:              number;
    disagreements:           string[];
    escalationRecommended:   boolean;
  };
}

// ─── Patient Monitoring ────────────────────────────────────────────────────────

export type MonitoringAlertType =
  | "tachycardia"
  | "hypoxia"
  | "hypotension"
  | "fever"
  | "respiratory_distress"
  | "sepsis_risk"
  | "custom";

export interface MonitoringAlert {
  type:     MonitoringAlertType;
  severity: RiskLevel;
  message:  string;
}

export interface MonitoringAssessment {
  alerts:                 MonitoringAlert[];
  deteriorationScore:     number;
  escalationRecommended:  boolean;
  reassessInMinutes?:     number;
}
