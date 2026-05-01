/**
 * complaintPathwaySchema.ts
 * server/clinical/complaintPathwaySchema.ts
 *
 * THE COMPLETE CLINICAL COMPLAINT PATHWAY SCHEMA
 *
 * Every complaint in Auralyn must implement this interface completely.
 * A complaint pathway with any null/empty required field is clinically
 * incomplete and must not be used in production.
 *
 * Run validatePathway() on every pathway before adding to production KB.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RedFlagRule {
  id:         string;
  symptom:    string;
  condition:  string;
  action:     "ER_IMMEDIATE" | "ER_URGENT" | "ESCALATE_TO_PHYSICIAN";
  rationale:  string;
  pearls:     string[];
}

export interface IntakeQuestion {
  id:              string;
  question:        string;
  type:            "boolean" | "scale" | "multiple_choice" | "text";
  options?:        string[];
  branch?:         Record<string, string[]>;
  redFlagTrigger?: string;
  clinicalPurpose: string;
}

export interface DifferentialDiagnosis {
  diagnosis:    string;
  icdCode:      string;
  prior:        number;
  urgency:      "emergent" | "urgent" | "routine" | "chronic";
  mustNotMiss:  boolean;
  likelihoodRatios: {
    supportingFindings: Array<{
      finding: string;
      lr:      number;
      source:  string;
    }>;
  };
  treatmentPrinciples: string;
  dispositionDefault:  "ER_SEND" | "URGENT_CARE" | "PCP" | "SELF_CARE";
}

export interface PhysicalExam {
  required:    string[];
  conditional: Array<{
    perform:   string;
    when:      string;
  }>;
  findings: Array<{
    finding:   string;
    indicates: string;
    urgency:   "red_flag" | "important" | "informational";
  }>;
}

export interface WorkupProtocol {
  alwaysOrder: string[];
  orderIf:     Array<{
    test:      string;
    condition: string;
    urgency:   "stat" | "routine";
  }>;
  neverOrder: Array<{
    test:      string;
    reason:    string;
  }>;
}

export interface DispositionCriteria {
  erSend:     string[];
  urgentCare: string[];
  pcp:        string[];
  selfCare:   string[];
  safetyNets: string[];
}

export interface TreatmentProtocol {
  firstLine: Array<{
    medication:        string;
    dose:              string;
    route:             string;
    duration:          string;
    notes:             string;
    contraindicatedIn: string[];
  }>;
  alternatives: Array<{
    medication:  string;
    indication:  string;
    dose:        string;
    route:       string;
    duration:    string;
  }>;
  nonPharmacologic:       string[];
  avoidInThisCondition:   string[];
}

export interface PatientCommunication {
  diagnosisExplanation:  string;
  treatmentExplanation:  string;
  returnPrecautions:     string[];
  followUpInstructions:  string;
  preventionCounseling:  string;
  npsDrivers:            string[];
}

export interface FollowUpProtocol {
  enrollIf: string[];
  checkIns: Array<{
    dayOffset:          number;
    questions:          string[];
    escalationTrigger:  string;
  }>;
}

export type ClinicalSystem =
  | "respiratory" | "cardiovascular" | "gastrointestinal" | "genitourinary"
  | "musculoskeletal" | "dermatology" | "neurology" | "ophthalmology"
  | "ent" | "endocrine" | "hematology" | "infectious" | "psychiatric"
  | "toxicology" | "trauma" | "gynecology" | "sexual_health" | "pediatric"
  | "allergy" | "dental" | "general";

export interface ComplaintPathway {
  slug:         string;
  displayName:  string;
  icdCategory:  string;
  system:       ClinicalSystem;
  acuityClass:  "emergent" | "urgent" | "routine" | "chronic";
  prevalence:   "very_common" | "common" | "uncommon" | "rare";

  redFlags:             RedFlagRule[];
  intakeQuestions:      IntakeQuestion[];
  differential:         DifferentialDiagnosis[];
  physicalExam:         PhysicalExam;
  workup:               WorkupProtocol;
  dispositionCriteria:  DispositionCriteria;
  treatment:            TreatmentProtocol;
  patientCommunication: PatientCommunication;
  followUp:             FollowUpProtocol;

  guidelineSource:    string[];
  lastClinicalReview: string;
  reviewedBy:         string;
  version:            number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface PathwayValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
  score:    number;
}

export function validatePathway(pathway: ComplaintPathway): PathwayValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!pathway.differential.some(d => d.mustNotMiss)) {
    errors.push("No must-not-miss diagnosis defined — every pathway needs at least one life-threatening diagnosis flagged");
    score -= 20;
  }

  if (pathway.redFlags.length < 3) {
    errors.push(`Only ${pathway.redFlags.length} red flag rules — minimum 3 required`);
    score -= 15;
  }

  const priorSum = pathway.differential.reduce((s, d) => s + d.prior, 0);
  if (Math.abs(priorSum - 1.0) > 0.05) {
    errors.push(`Differential priors sum to ${priorSum.toFixed(2)} — must sum to 1.0`);
    score -= 10;
  }

  if (pathway.physicalExam.required.length === 0) {
    errors.push("No required physical exam components defined");
    score -= 15;
  }

  if (pathway.dispositionCriteria.erSend.length === 0) {
    errors.push("No ER disposition criteria defined");
    score -= 10;
  }

  if (!pathway.patientCommunication.diagnosisExplanation) {
    errors.push("No patient-facing diagnosis explanation — required for NPS");
    score -= 10;
  }

  if (pathway.patientCommunication.returnPrecautions.length === 0) {
    errors.push("No return precautions defined — patient safety requirement");
    score -= 15;
  }

  if (pathway.guidelineSource.length === 0) {
    warnings.push("No guideline source documented — add evidence basis");
    score -= 5;
  }

  if (pathway.intakeQuestions.length < 5) {
    warnings.push(`Only ${pathway.intakeQuestions.length} intake questions — consider adding more`);
    score -= 5;
  }

  return {
    valid:  errors.length === 0,
    errors,
    warnings,
    score:  Math.max(0, score),
  };
}
