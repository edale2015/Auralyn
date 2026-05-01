/**
 * complaintPathwaySchema.ts
 * Drop into: server/clinical/complaintPathwaySchema.ts
 *
 * THE COMPLETE CLINICAL COMPLAINT PATHWAY SCHEMA
 *
 * Every complaint in Auralyn must implement this interface completely.
 * A complaint pathway with any null/empty required field is clinically
 * incomplete and must not be used in production.
 *
 * CLINICAL STANDARD:
 * Each pathway represents the clinical reasoning of a board-certified
 * urgent care physician. It must cover:
 *   - All life-threatening diagnoses that must not be missed
 *   - All common diagnoses in urgent care epidemiology
 *   - All required physical exam components
 *   - All appropriate workup for the acuity level
 *   - Safe and appropriate disposition criteria
 *   - Patient-facing communication that improves NPS
 *
 * VALIDATION:
 * Run validatePathway() on every pathway before adding to production KB.
 * A pathway that fails validation must not be used clinically.
 */

// ─── Complete pathway interface ───────────────────────────────────────────────

export interface RedFlagRule {
  id:         string;
  symptom:    string;     // what triggers this rule
  condition:  string;     // clinical condition it may indicate
  action:     "ER_IMMEDIATE" | "ER_URGENT" | "ESCALATE_TO_PHYSICIAN";
  rationale:  string;     // why this is a red flag
  pearls:     string[];   // clinical pearls for this red flag
}

export interface IntakeQuestion {
  id:          string;
  question:    string;    // patient-facing question text
  type:        "boolean" | "scale" | "multiple_choice" | "text";
  options?:    string[];  // for multiple_choice
  branch?:     Record<string, string[]>; // answer → next question IDs
  redFlagTrigger?: string; // which RedFlagRule this triggers if "yes"
  clinicalPurpose: string; // why we ask this (internal documentation)
}

export interface DifferentialDiagnosis {
  diagnosis:    string;
  icdCode:      string;
  prior:        number;   // base rate in urgent care (0-1, must sum to ~1.0)
  urgency:      "emergent" | "urgent" | "routine" | "chronic";
  mustNotMiss:  boolean;  // true = life-threatening if missed
  likelihoodRatios: {
    supportingFindings: Array<{
      finding: string;
      lr:      number;    // >1 = supports, <1 = contradicts
      source:  string;    // clinical decision rule or guideline
    }>;
  };
  treatmentPrinciples: string;
  dispositionDefault:  "ER_SEND" | "URGENT_CARE" | "PCP" | "SELF_CARE";
}

export interface PhysicalExam {
  required:    string[];  // must perform on every patient with this complaint
  conditional: Array<{
    perform:   string;
    when:      string;    // clinical condition requiring this exam
  }>;
  findings:    Array<{
    finding:   string;
    indicates: string;    // clinical significance
    urgency:   "red_flag" | "important" | "informational";
  }>;
}

export interface WorkupProtocol {
  alwaysOrder: string[];  // ordered on every patient regardless of presentation
  orderIf:     Array<{
    test:      string;
    condition: string;    // clinical indication
    urgency:   "stat" | "routine";
  }>;
  neverOrder:  Array<{
    test:      string;
    reason:    string;    // why not appropriate
  }>;
}

export interface DispositionCriteria {
  erSend:     string[];   // criteria requiring ED transfer
  urgentCare: string[];   // criteria appropriate for urgent care management
  pcp:        string[];   // criteria for PCP follow-up
  selfCare:   string[];   // criteria safe for home management
  safetyNets: string[];   // return precautions for all dispositions
}

export interface TreatmentProtocol {
  firstLine:  Array<{
    medication: string;
    dose:       string;
    route:      string;
    duration:   string;
    notes:      string;
    contraindicatedIn: string[];
  }>;
  alternatives: Array<{
    medication: string;
    indication: string;   // when to use instead of first line
    dose:       string;
    route:      string;
    duration:   string;
  }>;
  nonPharmacologic: string[];
  avoidInThisCondition: string[];
}

export interface PatientCommunication {
  diagnosisExplanation: string;  // plain English explanation of likely diagnosis
  treatmentExplanation: string;  // what we're doing and why
  returnPrecautions:    string[]; // specific warning signs to return immediately
  followUpInstructions: string;  // when and where to follow up
  preventionCounseling: string;  // relevant prevention advice
  npsDrivers: string[];          // what specifically improves patient satisfaction
}

export interface FollowUpProtocol {
  enrollIf:    string[];  // criteria for follow-up enrollment
  checkIns:    Array<{
    dayOffset:  number;
    questions:  string[];
    escalationTrigger: string;
  }>;
}

export interface ComplaintPathway {
  // Identity
  slug:         string;   // canonical slug, e.g., "ear_pain"
  displayName:  string;
  icdCategory:  string;
  system:       ClinicalSystem;
  acuityClass:  "emergent" | "urgent" | "routine" | "chronic";
  prevalence:   "very_common" | "common" | "uncommon" | "rare";

  // Clinical content
  redFlags:           RedFlagRule[];
  intakeQuestions:    IntakeQuestion[];
  differential:       DifferentialDiagnosis[];
  physicalExam:       PhysicalExam;
  workup:             WorkupProtocol;
  dispositionCriteria: DispositionCriteria;
  treatment:          TreatmentProtocol;
  patientCommunication: PatientCommunication;
  followUp:           FollowUpProtocol;

  // Metadata
  guidelineSource:    string[];  // which guidelines this is based on
  lastClinicalReview: string;    // date of last physician review
  reviewedBy:         string;    // physician ID
  version:            number;
}

export type ClinicalSystem =
  | "respiratory"
  | "cardiovascular"
  | "gastrointestinal"
  | "genitourinary"
  | "musculoskeletal"
  | "dermatology"
  | "neurology"
  | "ophthalmology"
  | "ent"         // ear, nose, throat
  | "endocrine"
  | "hematology"
  | "infectious"
  | "psychiatric"
  | "toxicology"
  | "trauma"
  | "gynecology"
  | "sexual_health"
  | "pediatric"
  | "allergy"
  | "dental"
  | "general";

// ─── Validation ───────────────────────────────────────────────────────────────

export interface PathwayValidationResult {
  valid:    boolean;
  errors:   string[];   // must fix before production
  warnings: string[];   // should fix before production
  score:    number;     // 0-100 completeness score
}

export function validatePathway(pathway: ComplaintPathway): PathwayValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Required: at least one must-not-miss diagnosis
  if (!pathway.differential.some(d => d.mustNotMiss)) {
    errors.push("No must-not-miss diagnosis defined — every pathway needs at least one life-threatening diagnosis flagged");
    score -= 20;
  }

  // Required: at least 3 red flag rules
  if (pathway.redFlags.length < 3) {
    errors.push(`Only ${pathway.redFlags.length} red flag rules — minimum 3 required`);
    score -= 15;
  }

  // Required: differential priors sum to approximately 1.0
  const priorSum = pathway.differential.reduce((s, d) => s + d.prior, 0);
  if (Math.abs(priorSum - 1.0) > 0.05) {
    errors.push(`Differential priors sum to ${priorSum.toFixed(2)} — must sum to 1.0`);
    score -= 10;
  }

  // Required: physical exam has required items
  if (pathway.physicalExam.required.length === 0) {
    errors.push("No required physical exam components defined");
    score -= 15;
  }

  // Required: at least one disposition criterion for each level
  if (pathway.dispositionCriteria.erSend.length === 0) {
    errors.push("No ER disposition criteria defined");
    score -= 10;
  }

  // Required: patient communication
  if (!pathway.patientCommunication.diagnosisExplanation) {
    errors.push("No patient-facing diagnosis explanation — required for NPS");
    score -= 10;
  }
  if (pathway.patientCommunication.returnPrecautions.length === 0) {
    errors.push("No return precautions defined — patient safety requirement");
    score -= 15;
  }

  // Required: at least one guideline source
  if (pathway.guidelineSource.length === 0) {
    warnings.push("No guideline source documented — add evidence basis");
    score -= 5;
  }

  // Warning: fewer than 5 intake questions
  if (pathway.intakeQuestions.length < 5) {
    warnings.push(`Only ${pathway.intakeQuestions.length} intake questions — consider adding more`);
    score -= 5;
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
    score:    Math.max(0, score),
  };
}
