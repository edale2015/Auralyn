export type RankedDiagnosis = {
  diagnosis: string;
  probability?: number;
  score?: number;
};

export type SupervisorInput = {
  caseId?: string;
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions?: Record<string, any>;
  unansweredQuestions?: string[];
  graphDifferential?: RankedDiagnosis[];
  bayesianDifferential?: RankedDiagnosis[];
  combinedDifferential?: RankedDiagnosis[];
  treatments?: string[];
  tests?: { name: string; urgency: "urgent" | "routine" }[];
  returnPrecautions?: string[];
  safetyOverride?: {
    triggered: boolean;
    ruleId?: string;
    reason?: string;
    disposition?: string;
  } | null;
  redFlags?: string[];
  entropy?: number;
  disposition?: string;
};

export type SupervisorDecision =
  | "ER_NOW"
  | "NEEDS_PHYSICIAN_REVIEW"
  | "NEEDS_WORKUP"
  | "SAFE_FOR_PROTOCOLIZED_CARE";

export type ConfidenceBand = "very_low" | "low" | "moderate" | "high";

export type SupervisorOutput = {
  supervisorDecision: SupervisorDecision;
  reasons: string[];
  blockers: string[];
  physicianReviewReasons: string[];
  confidenceBand: ConfidenceBand;
  topDiagnosis?: string;
  topProbability?: number;
  allowedToAutoTreat: boolean;
  allowedToAutoDischarge: boolean;
  escalationRecommended: boolean;
};

const HIGH_RISK_DIAGNOSES = new Set([
  "acute_coronary_syndrome",
  "acs",
  "pulmonary_embolism",
  "stroke",
  "subarachnoid_hemorrhage",
  "thunderclap_headache",
  "meningitis",
  "ectopic_pregnancy",
  "ovarian_torsion",
  "testicular_torsion",
  "appendicitis",
  "sepsis",
  "anaphylaxis",
  "aortic_dissection",
  "pneumothorax",
  "gi_bleed",
  "bowel_obstruction",
  "intracranial_hemorrhage",
  "epiglottitis",
  "deep_space_neck_infection",
]);

const CRITICAL_QUESTION_MAP: Record<string, string[]> = {
  chest_pain:          ["sob", "exertional", "radiation", "diaphoresis", "syncope"],
  headache:            ["thunderclap", "neuro_deficit", "neck_stiffness", "fever"],
  abdominal_pain:      ["pregnant", "rebound", "vomiting", "bloody_stool", "testicular_pain"],
  shortness_of_breath: ["chest_pain", "hypoxia", "wheeze", "leg_swelling", "fever"],
  sore_throat:         ["drooling", "stridor", "muffled_voice", "trismus"],
  dysuria:             ["fever", "flank_pain", "pregnant", "vomiting"],
  back_pain:           ["fever", "saddle_anesthesia", "bowel_bladder", "trauma"],
  ear_pain:            ["mastoid_swelling", "facial_weakness", "hearing_loss", "fever"],
  dizziness:           ["syncope", "chest_pain", "neuro_deficit", "head_trauma"],
};

function getTopDx(list?: RankedDiagnosis[]): RankedDiagnosis | undefined {
  if (!list || list.length === 0) return undefined;
  return [...list].sort(
    (a, b) => (b.probability ?? b.score ?? 0) - (a.probability ?? a.score ?? 0)
  )[0];
}

function confidenceBandFromProbability(p?: number): ConfidenceBand {
  if (p == null) return "very_low";
  if (p >= 0.80) return "high";
  if (p >= 0.55) return "moderate";
  if (p >= 0.35) return "low";
  return "very_low";
}

export function clinicalSupervisorEngine(input: SupervisorInput): SupervisorOutput {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const physicianReviewReasons: string[] = [];

  const top =
    getTopDx(input.combinedDifferential) ||
    getTopDx(input.bayesianDifferential) ||
    getTopDx(input.graphDifferential);

  const topDiagnosis  = top?.diagnosis;
  const topProbability = top?.probability ?? top?.score ?? 0;
  const confidenceBand = confidenceBandFromProbability(topProbability);

  // ── 1. Safety override — immediate ER ────────────────────────────────────
  if (input.safetyOverride?.triggered) {
    reasons.push(`Safety override triggered: ${input.safetyOverride.ruleId || "unknown_rule"}`);
    blockers.push(input.safetyOverride.reason || "Emergency rule triggered");
    return {
      supervisorDecision: "ER_NOW",
      reasons,
      blockers,
      physicianReviewReasons,
      confidenceBand,
      topDiagnosis,
      topProbability,
      allowedToAutoTreat:    false,
      allowedToAutoDischarge: false,
      escalationRecommended: true,
    };
  }

  // ── 2. Red flags ──────────────────────────────────────────────────────────
  if ((input.redFlags || []).length > 0) {
    reasons.push("Red flag symptoms present");
    physicianReviewReasons.push(...(input.redFlags || []).map((f) => `Red flag: ${f}`));
  }

  // ── 3. High-risk diagnosis ────────────────────────────────────────────────
  if (topDiagnosis && HIGH_RISK_DIAGNOSES.has(topDiagnosis)) {
    reasons.push(`High-risk diagnosis in differential: ${topDiagnosis}`);
    physicianReviewReasons.push(`High-risk diagnosis requires clinician review: ${topDiagnosis}`);
  }

  // Check all differentials (not just the top) for high-risk
  const allDx = [
    ...(input.combinedDifferential || []),
    ...(input.bayesianDifferential || []),
    ...(input.graphDifferential || []),
  ];
  for (const dx of allDx) {
    if (dx.diagnosis !== topDiagnosis && HIGH_RISK_DIAGNOSES.has(dx.diagnosis)) {
      physicianReviewReasons.push(`Dangerous diagnosis in differential: ${dx.diagnosis}`);
    }
  }

  // ── 4. Diagnostic uncertainty ─────────────────────────────────────────────
  if ((input.entropy ?? 0) >= 1.0) {
    reasons.push(`High diagnostic uncertainty (entropy=${input.entropy?.toFixed(2)})`);
    blockers.push("Differential remains too uncertain");
  }

  // ── 5. Missing critical questions ─────────────────────────────────────────
  const criticalQuestions = CRITICAL_QUESTION_MAP[input.complaint] || [];
  const unansweredSet = new Set(input.unansweredQuestions || []);
  const missingCritical = criticalQuestions.filter((q) => unansweredSet.has(q));
  if (missingCritical.length > 0) {
    reasons.push(`Missing critical complaint questions: ${missingCritical.join(", ")}`);
    blockers.push("Critical history incomplete");
  }

  // ── 6. Urgent tests ordered ───────────────────────────────────────────────
  const urgentTests = (input.tests || []).filter((t) => t.urgency === "urgent");
  if (urgentTests.length > 0) {
    reasons.push(`Urgent testing recommended: ${urgentTests.map((t) => t.name).join(", ")}`);
    physicianReviewReasons.push("Urgent tests suggest need for higher-level review");
  }

  // ── 7. Low evidence / no strong diagnosis ────────────────────────────────
  const lowEvidence =
    !topDiagnosis ||
    topProbability < 0.45 ||
    (input.combinedDifferential?.length || 0) === 0;
  if (lowEvidence) {
    reasons.push("Evidence insufficient for confident protocolized disposition");
    blockers.push("Weak top diagnosis / low evidence");
  }

  // ── 8. Treatment plan completeness ───────────────────────────────────────
  if ((input.treatments || []).length === 0 && topDiagnosis) {
    reasons.push("No treatment options generated for top diagnosis");
    blockers.push("Treatment plan incomplete");
  }

  // ── 9. Discharge instruction completeness ────────────────────────────────
  if ((input.returnPrecautions || []).length === 0) {
    reasons.push("No return precautions generated");
    blockers.push("Safety discharge instructions incomplete");
  }

  // ── Decision ──────────────────────────────────────────────────────────────
  const physicianReviewNeeded =
    physicianReviewReasons.length > 0 ||
    HIGH_RISK_DIAGNOSES.has(topDiagnosis || "") ||
    urgentTests.length > 0;

  const needsWorkup =
    (input.entropy ?? 0) >= 1.0 ||
    missingCritical.length > 0 ||
    lowEvidence;

  if (physicianReviewNeeded && !needsWorkup) {
    return {
      supervisorDecision: "NEEDS_PHYSICIAN_REVIEW",
      reasons, blockers, physicianReviewReasons, confidenceBand,
      topDiagnosis, topProbability,
      allowedToAutoTreat:    false,
      allowedToAutoDischarge: false,
      escalationRecommended: true,
    };
  }

  if (needsWorkup) {
    return {
      supervisorDecision: "NEEDS_WORKUP",
      reasons, blockers, physicianReviewReasons, confidenceBand,
      topDiagnosis, topProbability,
      allowedToAutoTreat:    false,
      allowedToAutoDischarge: false,
      escalationRecommended: true,
    };
  }

  return {
    supervisorDecision: "SAFE_FOR_PROTOCOLIZED_CARE",
    reasons, blockers, physicianReviewReasons, confidenceBand,
    topDiagnosis, topProbability,
    allowedToAutoTreat:    true,
    allowedToAutoDischarge: true,
    escalationRecommended: false,
  };
}
