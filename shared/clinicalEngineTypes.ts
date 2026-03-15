// ─── Mega-bundle types (added from clinical_brain_mega_bundle) ───────────────

export type Disposition =
  | 'ER_NOW'
  | 'URGENT_SAME_DAY'
  | 'OFFICE_24H'
  | 'VIDEO_VISIT'
  | 'HOME_CARE'
  | 'NEEDS_WORKUP'
  | 'NEEDS_PHYSICIAN_REVIEW'
  | 'BLOCK';

export type SupervisorDecision = 'PASS' | 'ESCALATE' | 'BLOCK';

export interface PatientProfile {
  age?: number;
  sex?: 'male' | 'female' | 'intersex' | 'unknown';
  pregnant?: boolean;
  weightKg?: number;
  comorbidities?: string[];
  medications?: string[];
  allergies?: string[];
  labs?: Record<string, string | number | boolean | null | undefined>;
}

export interface DifferentialScore {
  diagnosis: string;
  score: number;
  rationale?: string[];
  source?: string;
}

export interface QuestionScore {
  questionId: string;
  score: number;
  reason?: string;
}

export interface MemoryCase {
  caseId: string;
  complaint: string;
  symptoms: string[];
  finalDiagnosis?: string;
  finalDisposition?: Disposition;
  outcome?: string;
  createdAt: string;
}

export interface ContradictionFinding {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface SafetyGuardResult {
  triggered: boolean;
  ruleId?: string;
  disposition?: Disposition;
  reason?: string;
}

export interface GovernanceSignals {
  severityLevel?: SeverityLevel;
  completenessPassed?: boolean;
  contradictionErrors?: number;
  protocolVarianceMajor?: boolean;
  driftMajor?: boolean;
  guidelineIssues?: string[];
  supervisorDecision?: SupervisorDecision;
}

export interface MegaGraphNode {
  id: string;
  type: 'complaint' | 'symptom' | 'diagnosis' | 'test' | 'treatment' | 'red_flag' | 'question';
  label: string;
  metadata?: Record<string, unknown>;
}

export interface MegaGraphEdge {
  from: string;
  to: string;
  relation: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ─── Legacy types ──────────────────────────────────────────────────────────
export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical';
export type GovernanceDecision = 'APPROVE' | 'NEEDS_PHYSICIAN_REVIEW' | 'BLOCK';
export type DispositionLabel = 'HOME_CARE' | 'NEEDS_WORKUP' | 'URGENT_CARE' | 'ED_NOW' | 'ER_NOW' | 'CALL_911';

export interface VitalSigns {
  temperatureF?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  spo2?: number;
}

export interface RankedScore {
  key: string;
  score: number;
  reasons?: string[];
}

export interface RedFlagHit {
  id: string;
  label: string;
  severity: SeverityLevel;
  rationale: string;
}

export interface BrainCaseInput {
  caseId: string;
  complaint: string;
  ageYears?: number;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  symptoms: string[];
  answeredQuestions?: string[];
  unansweredQuestions?: string[];
  vitals?: VitalSigns;
  pregnancy?: boolean;
  comorbidities?: string[];
  medications?: string[];
  allergies?: string[];
  checkedSymptoms?: Record<string, boolean | string | number>;
  priorDifferentials?: RankedScore[];
  priorSnapshots?: DifferentialSnapshot[];
}

export interface DifferentialSnapshot {
  at: string;
  topDifferential?: string;
  topScore?: number;
  ranked: RankedScore[];
}

export interface SimilarityResult {
  matchedCases: Array<{ caseId: string; score: number; diagnosis?: string; disposition?: string }>;
  rankedDiagnoses: RankedScore[];
}

export interface BayesianResult {
  rankedDiagnoses: RankedScore[];
  entropy?: number;
}

export interface GraphResult {
  rankedDiagnoses: RankedScore[];
  tests: RankedScore[];
  treatments: RankedScore[];
  redFlags: RedFlagHit[];
}

export interface AggregatedEvidenceResult {
  rankedDiagnoses: RankedScore[];
  components: Record<string, { bayesian?: number; similarity?: number; graph?: number; total: number }>;
}

export interface UncertaintyResult {
  entropy: number;
  recommendation: 'ask_more_questions' | 'needs_workup' | 'adequate_confidence';
}

export interface NextQuestionResult {
  nextBestQuestion?: string;
  questionRankings?: RankedScore[];
}

export interface SeverityScoreResult {
  score: number;
  severityLevel: SeverityLevel;
  contributors: string[];
}

export interface CompletenessResult {
  passed: boolean;
  level: 'complete' | 'missing_minor' | 'missing_major' | 'missing_critical';
  missingQuestions: string[];
}

export interface VarianceResult {
  hasMajorVariance: boolean;
  hasMinorVariance: boolean;
  findings: string[];
}

export interface DriftResult {
  hasMajorDrift: boolean;
  hasMinorDrift: boolean;
  findings: string[];
}

export interface MedicationSafetyResult {
  blocked: boolean;
  warnings: string[];
  saferAlternatives: string[];
}

export interface GovernanceResult {
  decision: GovernanceDecision;
  rationale: string[];
}

export interface CalibrationResult {
  disposition: DispositionLabel;
  rationale: string[];
}

export interface CoordinationOutput {
  severity: SeverityScoreResult;
  completeness: CompletenessResult;
  variance: VarianceResult;
  drift: DriftResult;
  governance: GovernanceResult;
  calibratedDisposition: CalibrationResult;
}

export interface BrainOutput {
  normalizedSymptoms: string[];
  contradiction?: { hasErrors: boolean; hasWarnings: boolean; findings: string[] };
  safetyDecision?: CalibrationResult;
  memory?: Array<{ caseId: string; score: number; diagnosis?: string }>;
  similarity?: SimilarityResult;
  graph?: GraphResult;
  bayesian?: BayesianResult;
  aggregatedEvidence?: AggregatedEvidenceResult;
  uncertainty?: UncertaintyResult;
  nextQuestion?: NextQuestionResult;
  treatments?: RankedScore[];
  tests?: RankedScore[];
  precautions?: string[];
  severity?: SeverityScoreResult;
  completeness?: CompletenessResult;
  variance?: VarianceResult;
  drift?: DriftResult;
  governance?: GovernanceResult;
  finalDisposition: CalibrationResult;
}
