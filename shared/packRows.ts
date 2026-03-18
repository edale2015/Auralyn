export type PackTier = "symptom" | "modifier" | "clinician_algorithm";
export type Disposition =
  | "self_care"
  | "office_followup"
  | "telemed_now"
  | "urgent_care"
  | "er_now";

export type QuestionType =
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "text"
  | "number"
  | "duration"
  | "severity";

export interface PackRowBase {
  id: string;
  system: string;
  tier: PackTier;
  title: string;
  isActive: boolean;
  version: number;
  tags?: string[];
}

export interface SymptomPackRow extends PackRowBase {
  tier: "symptom";
  aliases: string[];
  likelyDisposition: Disposition;
  questionsJson: string;
  redFlags: string[];
  autoEscalateRules: string[];
  autoReviewRules: string[];
  planTemplateKey: string;
}

export interface ModifierPackRow extends PackRowBase {
  tier: "modifier";
  appliesToSymptoms: string[];
  triggers: string[];
  riskAdjustmentsJson: string;
}

export interface ClinicianAlgorithmRow extends PackRowBase {
  tier: "clinician_algorithm";
  entryCriteria: string[];
  requiredInputs: string[];
  outputActions: string[];
  notes?: string[];
}

export interface IntakeQuestionOption {
  label: string;
  value: string;
  redFlag?: boolean;
}

export interface IntakeQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  priority: number;
  required?: boolean;
  options?: IntakeQuestionOption[];
  helpText?: string;
}

export interface ModifierRiskAdjustment {
  condition: string;
  action: "raise_risk" | "force_review" | "force_escalation";
  amount?: number;
  reason: string;
}

export interface ParsedSymptomPack {
  id: string;
  system: string;
  title: string;
  aliases: string[];
  likelyDisposition: Disposition;
  questions: IntakeQuestion[];
  redFlags: string[];
  autoEscalateRules: string[];
  autoReviewRules: string[];
  planTemplateKey: string;
  tags?: string[];
}

export interface ParsedModifierPack {
  id: string;
  system: string;
  title: string;
  appliesToSymptoms: string[];
  triggers: string[];
  riskAdjustments: ModifierRiskAdjustment[];
  tags?: string[];
}

export interface ParsedClinicianAlgorithm {
  id: string;
  system: string;
  title: string;
  entryCriteria: string[];
  requiredInputs: string[];
  outputActions: string[];
  notes?: string[];
  tags?: string[];
}

export interface AnswerMap {
  [key: string]: string | number | boolean | null | undefined;
}
