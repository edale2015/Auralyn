/**
 * chestPainIntake.ts
 *
 * Deterministic, LLM-free intake script for the chest_pain pathway.
 *
 * THREE LEVELS of questioning — mirrors standard medical interview:
 *
 *   Level 1 — HPI (History of Present Illness)
 *     Clarifies the chief complaint: onset, character, location, severity.
 *
 *   Level 2 — Secondary / Associated Symptoms
 *     Identifies associated symptoms that differentiate the differential:
 *     radiation, dyspnea, diaphoresis, nausea, palpitations, syncope.
 *     These map directly to red-flag fields in kb_master_rules.
 *
 *   Level 3 — Modifying Factors (demographics + PMH)
 *     Patient context that weights the differential: age, sex, past cardiac
 *     history, risk factors (HTN / DM / cholesterol), family history, smoking,
 *     leg swelling (PE risk), pleuritic character, modifying factors.
 *     Maps to HEART score fields, CAR_Q_CP_* dependencies, and Q_CCP_* deps.
 *
 *   Then: Allergies → Medications → pipeline.
 *
 * Why deterministic: the legacy LLM flow re-asked answered questions ("sweating?"
 * → No → "sweating?"). Here every reply is recorded against the exact question
 * that was just asked, and the cursor only ever moves forward.
 */

export type IntakeSection =
  | "chief_complaint"
  | "hpi"
  | "secondary"
  | "modifying"
  | "demographics"
  | "pmh"
  | "allergies"
  | "medications";

export interface IntakeQuestion {
  id:      string;
  section: IntakeSection;
  field:   string;
  text:    string;
  kind:    "freetext" | "yesno" | "scale";
}

export const INTAKE_SECTIONS: readonly IntakeSection[] = [
  "chief_complaint",
  "hpi",
  "secondary",
  "modifying",
  "demographics",
  "pmh",
  "allergies",
  "medications",
];

export const CHEST_PAIN_INTAKE: readonly IntakeQuestion[] = [

  // ── Level 1: History of Present Illness ────────────────────────────────────
  // Clarifies onset, character, location, severity — the 4 cardinal HPI pillars.
  {
    id: "cp_hpi_onset",
    section: "hpi",
    field: "onset",
    kind: "freetext",
    text: "When did the chest pain start, and what were you doing at the time?",
  },
  {
    id: "cp_hpi_character",
    section: "hpi",
    field: "character",
    kind: "freetext",
    text: "How would you describe the pain — is it sharp, dull, pressure, squeezing, or tearing?",
  },
  {
    id: "cp_hpi_location",
    section: "hpi",
    field: "location",
    kind: "freetext",
    text: "Where in your chest do you feel it most — center, left side, right side?",
  },
  {
    id: "cp_hpi_severity",
    section: "hpi",
    field: "severity",
    kind: "scale",
    text: "On a scale of 1 to 10, how severe is the pain right now?",
  },

  // ── Level 2: Secondary / Associated Symptoms ───────────────────────────────
  // Each question maps to a specific red-flag or differential-weighting field.
  // radiation_arm / radiation_jaw are separate CRITICAL red flags in the DB.
  {
    id: "cp_sec_radiation",
    section: "secondary",
    field: "radiation",
    kind: "yesno",
    text: "Does the pain spread anywhere — your arm, jaw, neck, or back?",
  },
  {
    id: "cp_sec_dyspnea",
    section: "secondary",
    field: "dyspnea",
    kind: "yesno",
    text: "Are you having any shortness of breath?",
  },
  {
    id: "cp_sec_diaphoresis",
    section: "secondary",
    field: "diaphoresis",
    kind: "yesno",
    text: "Are you sweating or feeling clammy?",
  },
  {
    id: "cp_sec_nausea",
    section: "secondary",
    field: "nausea",
    kind: "yesno",
    text: "Any nausea or vomiting?",
  },
  {
    id: "cp_sec_palpitations",
    section: "secondary",
    field: "palpitations",
    kind: "yesno",
    text: "Any racing heart or palpitations?",
  },
  {
    id: "cp_sec_syncope",
    section: "secondary",
    field: "syncope",
    kind: "yesno",
    text: "Have you fainted or felt like you were about to faint?",
  },

  // ── Level 3a: Modifying Factors (symptom modifiers) ───────────────────────
  // Exertional trigger and pleuritic character are separate differentiators.
  {
    id: "cp_mod_exertional",
    section: "modifying",
    field: "exertional",
    kind: "yesno",
    text: "Does the pain come on or get worse with physical activity or exertion?",
  },
  {
    id: "cp_mod_pleuritic",
    section: "modifying",
    field: "pleuritic",
    kind: "yesno",
    text: "Does the pain get worse when you take a deep breath or cough?",
  },
  {
    id: "cp_mod_worse",
    section: "modifying",
    field: "worse",
    kind: "freetext",
    text: "Is there anything else that makes the pain worse — position, movement, swallowing?",
  },
  {
    id: "cp_mod_better",
    section: "modifying",
    field: "better",
    kind: "freetext",
    text: "Does anything make the pain better — rest, sitting forward, antacids?",
  },
  {
    id: "cp_mod_leg_swelling",
    section: "modifying",
    field: "leg_swelling",
    kind: "yesno",
    text: "Do you have any swelling, pain, or redness in one leg?",
  },

  // ── Level 3b: Demographics ─────────────────────────────────────────────────
  // Age and sex feed into HEART score and PE risk calculations.
  {
    id: "cp_dem_age",
    section: "demographics",
    field: "age",
    kind: "freetext",
    text: "How old are you?",
  },
  {
    id: "cp_dem_sex",
    section: "demographics",
    field: "sex",
    kind: "freetext",
    text: "What is your biological sex — male or female?",
  },

  // ── Level 3c: Past Medical History ────────────────────────────────────────
  // Maps to CAR_Q_CP_PM_HX, heart_history_high/moderate, heart_risk_factors_*
  {
    id: "cp_pmh_cardiac",
    section: "pmh",
    field: "pmh_cardiac",
    kind: "yesno",
    text: "Have you ever had a heart attack, a stent placed, or bypass surgery?",
  },
  {
    id: "cp_pmh_risk",
    section: "pmh",
    field: "pmh_risk",
    kind: "freetext",
    text: "Do you have high blood pressure, diabetes, or high cholesterol? (say which ones apply, or none)",
  },
  {
    id: "cp_pmh_fhx",
    section: "pmh",
    field: "family_hx",
    kind: "yesno",
    text: "Any family history of heart disease or heart attacks, especially before age 65?",
  },
  {
    id: "cp_pmh_smoking",
    section: "pmh",
    field: "smoking",
    kind: "yesno",
    text: "Do you currently smoke, or have you smoked in the past?",
  },

  // ── Allergies ─────────────────────────────────────────────────────────────
  {
    id: "cp_allergies",
    section: "allergies",
    field: "allergies",
    kind: "freetext",
    text: "Do you have any allergies to medications? If so, which ones?",
  },

  // ── Medications ───────────────────────────────────────────────────────────
  {
    id: "cp_medications",
    section: "medications",
    field: "medications",
    kind: "freetext",
    text: "Are you currently taking any medications? If so, which ones?",
  },
];

export interface IntakeState {
  asked:    number;
  answers:  Record<string, string>;
  askedIds: string[];
  done:     boolean;
}

const NEGATIVE_EXACT = new Set([
  "no", "nope", "nah", "naw", "n", "na", "n/a", "none", "no none",
  "nothing", "negative", "not really", "no not really", "no allergies",
  "no meds", "no medications", "not at all", "never",
]);

const AFFIRMATIVE_EXACT = new Set([
  "yes", "yeah", "yep", "yup", "sure", "y", "correct", "right",
  "uh huh", "mhm", "i do", "definitely",
]);

function isNegative(s: string): boolean {
  if (!s) return false;
  if (NEGATIVE_EXACT.has(s)) return true;
  return /^(no\b|nope|nah\b|naw\b|none\b|not really|nothing|negative|not that i|none that i|i don.?t think|don.?t think|not at all|never\b|no,? )/.test(s);
}

function isAffirmative(s: string): boolean {
  if (AFFIRMATIVE_EXACT.has(s)) return true;
  return /^(yes|yeah|yep|yup|sure|correct|i do|i think so|definitely|yes,? )/.test(s);
}

/**
 * Interpret a patient reply against the question that was just asked, ALWAYS
 * returning a non-empty recorded value. A plain "No"/"nope"/"none that I
 * know of" is a valid, recorded answer — it never leaves the field blank,
 * which is exactly what kept the legacy flow looping.
 */
export function interpretAnswer(q: IntakeQuestion, text: string): string {
  const raw = String(text ?? "").trim();
  const s   = raw.toLowerCase();

  if (isNegative(s)) {
    if (q.section === "allergies" || q.section === "medications") return "none";
    if (q.section === "demographics" || q.section === "pmh") return "none";
    return "no";
  }
  if (q.kind === "yesno" && isAffirmative(s)) return "yes";
  if (q.kind === "scale") {
    const num = s.match(/\b(10|[0-9])\b/);
    if (num) return num[1];
  }
  return raw || "(no answer)";
}

/** Begin a fresh intake from the opening chief-complaint message. */
export function startIntake(chiefComplaintText: string): {
  state: IntakeState;
  question: IntakeQuestion;
} {
  const q0 = CHEST_PAIN_INTAKE[0];
  return {
    state: {
      asked:    1,
      answers:  { chief_complaint: String(chiefComplaintText ?? "").trim() },
      askedIds: [q0.id],
      done:     false,
    },
    question: q0,
  };
}

/**
 * Record the answer to the pending question and return the next question, or
 * null when the script is exhausted (intake complete). Mutates `state`.
 */
export function advanceIntake(
  state: IntakeState,
  patientText: string,
): { question: IntakeQuestion | null } {
  const pending = CHEST_PAIN_INTAKE[state.asked - 1];
  if (pending) {
    state.answers[pending.field] = interpretAnswer(pending, patientText);
  }
  if (state.asked >= CHEST_PAIN_INTAKE.length) {
    state.done = true;
    return { question: null };
  }
  const next = CHEST_PAIN_INTAKE[state.asked];
  state.asked += 1;
  state.askedIds.push(next.id);
  return { question: next };
}
