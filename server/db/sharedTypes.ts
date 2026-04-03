export type RiskBand = "low" | "medium" | "high" | "critical";
export type ClinicalDisposition = "ER_NOW" | "URGENT_CARE" | "HOME_CARE" | "PHYSICIAN_REVIEW";
export type SignatureMeaning =
  | "override_ai_disposition"
  | "approve_ai_disposition"
  | "approve_model_promotion";

export interface ClinicalPopulationFlags {
  immunocompromised: boolean;
  elderlyOver75: boolean;
  pregnant: boolean;
  pediatricUnder2: boolean;
  dialysisDependent: boolean;
}

export interface BayesianCandidate {
  diagnosisKey: string;
  posterior: number;
  confidence?: number;
  explanation?: string;
}

export interface DebateAgentOpinion {
  agent: "safety_veto" | "hybrid" | "bayesian";
  diagnosisKey?: string;
  disposition: ClinicalDisposition;
  confidence: number;
  rationale: string;
  veto?: boolean;
}

export interface DebateResolution {
  policyVersion: string;
  outcome: "VETO_BLOCK" | "HIGHER_ACUITY_WINS" | "MERGED_DIFFERENTIAL" | "CONSENSUS";
  finalDisposition: ClinicalDisposition;
  diagnoses: string[];
  requiresPhysicianReview: boolean;
  rationale: string;
}

export interface StructuredOverrideReason {
  category:
    | "diagnosis_incorrect"
    | "diagnosis_incomplete"
    | "disposition_too_aggressive"
    | "disposition_insufficient"
    | "medication_inappropriate"
    | "documentation_error"
    | "patient_preference"
    | "clinical_context_not_captured"
    | "other";
  freeText?: string;
}
