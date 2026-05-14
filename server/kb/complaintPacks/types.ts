/**
 * types.ts — Shared type definitions for Complaint Packs
 * All clinical complaint intelligence modules share these contracts.
 */

export interface ExtractedClinicalState {
  complaintId:        string;
  chiefComplaint:     string;

  // Demographics
  ageYears?:          number;
  sex?:               "male" | "female" | "other";
  pregnant?:          boolean;
  immunocompromised?: boolean;

  // Vitals (from self-report or device)
  tempF?:             number;
  o2Sat?:             number;
  hrBpm?:             number;
  sbp?:               number;
  dbp?:               number;
  rrBreaths?:         number;

  // Symptom flags — populated by ComplaintPack extraction
  symptoms:           Record<string, boolean | number | string>;

  // PMH / risk factors
  comorbidities:      string[];
  currentMeds:        string[];
  allergies:          string[];
  smokingStatus?:     "never" | "former" | "current";

  // Raw Q&A log
  answerLog:          AnswerEntry[];

  // Computed scores (filled in by pack)
  scores:             Record<string, number>;

  // Free text narrative (PHI-scrubbed)
  narrativeScrubbed?: string;
}

export interface AnswerEntry {
  questionId:  string;
  questionText: string;
  answer:      string;
  answeredAt:  string;
}

export interface RedFlagCriteria {
  id:          string;
  label:       string;
  match:       (state: ExtractedClinicalState) => boolean;
  severity:    "critical" | "high" | "moderate";
  action:      "ER_IMMEDIATE" | "ER_URGENT" | "URGENT_CARE" | "ALERT_PHYSICIAN";
  icd10?:      string;
}

export interface Differential {
  id:          string;
  name:        string;
  icd10:       string;
  criteria:    (state: ExtractedClinicalState) => number;   // returns score 0-100
  cannotMiss:  boolean;
  dispositionIfLikely: DispositionCode;
}

export interface QuestionSet {
  phase:       "hpi" | "ros" | "pmh" | "safety";
  questions:   DialogueQuestion[];
}

export interface DialogueQuestion {
  id:          string;
  text:        string;
  type:        "yesno" | "scale" | "open" | "multichoice";
  options?:    string[];
  extractKey:  string;
  required:    boolean;
  condition?:  (state: ExtractedClinicalState) => boolean;
}

export interface WorkupBundle {
  id:          string;
  label:       string;
  tests:       string[];
  indication:  (state: ExtractedClinicalState) => boolean;
}

export type DispositionCode =
  | "ER_IMMEDIATE"
  | "ER_URGENT"
  | "URGENT_CARE_TODAY"
  | "URGENT_CARE_24H"
  | "PRIMARY_CARE_48H"
  | "PRIMARY_CARE_ROUTINE"
  | "TELEHEALTH"
  | "HOME_CARE"
  | "OBSERVATION";

export interface DispositionRule {
  id:          string;
  label:       string;
  disposition: DispositionCode;
  color:       "red" | "orange" | "yellow" | "green";
  condition:   (state: ExtractedClinicalState) => boolean;
  priority:    number;
  rationale:   string;
}

export interface MedicationGroup {
  group:       string;
  agents:      string[];
  indication:  string;
  contraindications: string[];
}

export interface TriageResult {
  complaintId:       string;
  disposition:       DispositionCode;
  dispositionColor:  "red" | "orange" | "yellow" | "green";
  dispositionLabel:  string;
  rationale:         string;
  topDifferentials:  Array<{ id: string; name: string; icd10: string; score: number; cannotMiss: boolean }>;
  redFlagsTriggered: string[];
  workupRecommended: string[];
  medicationsToConsider: string[];
  criticalGaps:      string[];
  scores:            Record<string, number>;
  computedAt:        string;
}

export interface ComplaintPack {
  id:                string;
  displayName:       string;
  icd10Primary:      string;
  redFlags:          RedFlagCriteria[];
  differentials:     Differential[];
  questionSets:      QuestionSet[];
  workupBundles:     WorkupBundle[];
  dispositionRules:  DispositionRule[];
  medicationGroups:  MedicationGroup[];
  computeTriage:     (state: ExtractedClinicalState) => TriageResult;
}
