export type Disposition =
  | "home_supportive_care"
  | "home_with_rx"
  | "follow_up_primary_care"
  | "same_day_urgent_care"
  | "er_now"
  | "hospital_admission";

export type ConfidenceBand = "low" | "moderate" | "high";

export type TreatmentClass =
  | "none"
  | "supportive"
  | "antibiotic"
  | "antiviral"
  | "steroid"
  | "bronchodilator"
  | "topical"
  | "antifungal";

export interface ClinicalFeatureMap {
  [key: string]: boolean | number | string | null | undefined;
}

export interface SyndromeCandidate {
  syndromeId: string;
  label: string;
  score: number;
  rationale: string[];
  requiredFeaturesMet: boolean;
}

export interface CanonicalTreatmentPlan {
  class: TreatmentClass;
  medicationKey?: string;
  indication: string;
  whyChosen: string[];
  whyNotBroader: string[];
  blockedAlternatives: string[];
}

export interface CanonicalDispositionPlan {
  disposition: Disposition;
  urgency: number;
  rationale: string[];
  redFlagsTriggered: string[];
  followUpWindow?: string;
}

export interface CanonicalDecision {
  complaint: string;
  phenotypeHash: string;
  confidence: ConfidenceBand;
  winningSyndrome: SyndromeCandidate | null;
  alternatives: SyndromeCandidate[];
  treatment: CanonicalTreatmentPlan;
  disposition: CanonicalDispositionPlan;
  notesForClinician: string[];
  varianceWarnings: string[];
}
