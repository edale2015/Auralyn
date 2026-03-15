export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical';
export type SupervisorDecision = 'PASS' | 'ESCALATE' | 'BLOCK';
export type Disposition =
  | 'self_care'
  | 'telemed_followup'
  | 'urgent_care'
  | 'er_now'
  | 'needs_physician_review'
  | 'needs_workup';

export interface RankedItem {
  id: string;
  label?: string;
  score: number;
  reasons?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface VitalSet {
  temperatureC?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2?: number;
  ageYears?: number;
  pregnant?: boolean;
}

export interface PriorSnapshot {
  at: string;
  topDiagnosis?: string;
  topScore?: number;
  differentials?: RankedItem[];
}

export interface BrainCaseInput {
  caseId: string;
  complaint: string;
  ageYears?: number;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  symptoms: string[];
  negatedSymptoms?: string[];
  freeText?: string;
  vitals?: VitalSet;
  history?: string[];
  meds?: string[];
  allergies?: string[];
  riskFactors?: string[];
  answeredQuestions?: string[];
  unansweredQuestions?: string[];
  currentDifferentials?: RankedItem[];
  priorSnapshots?: PriorSnapshot[];
  metadata?: Record<string, unknown>;
}

export interface ContradictionResult {
  hasErrors: boolean;
  hasWarnings: boolean;
  errors: string[];
  warnings: string[];
}

export interface SafetyGuardResult {
  triggered: boolean;
  ruleIds: string[];
  disposition?: Disposition;
  reasons: string[];
}

export interface MemoryMatch {
  caseId: string;
  complaint: string;
  similarity: number;
  outcome?: string;
  diagnoses?: RankedItem[];
}

export interface MemoryRetrieveResult {
  matches: MemoryMatch[];
}

export interface UncertaintyResult {
  entropy: number;
  isHigh: boolean;
  recommendation: 'ask_next_question' | 'continue' | 'escalate_review';
}

export interface CompletenessResult {
  passed: boolean;
  level: 'complete' | 'partial' | 'insufficient';
  missingQuestions: string[];
}

export interface GuidelineAdherenceResult {
  passed: boolean;
  minorVariance: string[];
  majorVariance: string[];
}

export interface ProtocolVarianceResult {
  hasMinor: boolean;
  hasMajor: boolean;
  notes: string[];
}

export interface DriftResult {
  majorDrift: boolean;
  summary: string[];
}

export interface SeverityResult {
  level: SeverityLevel;
  score: number;
  reasons: string[];
}

export interface MedicationSafetyAlert {
  severity: 'warning' | 'block';
  medication: string;
  reason: string;
  saferAlternative?: string;
}

export interface MedicationSafetyResult {
  alerts: MedicationSafetyAlert[];
  blocked: boolean;
}

export interface SupervisorResult {
  decision: SupervisorDecision;
  reasons: string[];
}

export interface ReviewPacketResult {
  summary: string;
  keyRisks: string[];
  topDifferentials: RankedItem[];
  recommendedTests: RankedItem[];
}

export interface BrainOutput {
  normalizedSymptoms?: string[];
  contradictions?: ContradictionResult;
  safety?: SafetyGuardResult;
  memory?: MemoryRetrieveResult;
  graphDifferentials?: RankedItem[];
  bayesDifferentials?: RankedItem[];
  aggregatedDifferentials?: RankedItem[];
  uncertainty?: UncertaintyResult;
  completeness?: CompletenessResult;
  guidelineAdherence?: GuidelineAdherenceResult;
  protocolVariance?: ProtocolVarianceResult;
  drift?: DriftResult;
  severity?: SeverityResult;
  supervisor?: SupervisorResult;
  tests?: RankedItem[];
  treatments?: RankedItem[];
  returnPrecautions?: string[];
  reviewPacket?: ReviewPacketResult;
  disposition: Disposition;
  dispositionReasons: string[];
}

export interface CoordinationOutput extends BrainOutput {
  coordinationTrace: string[];
}
