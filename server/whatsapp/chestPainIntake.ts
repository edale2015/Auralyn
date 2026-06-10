/**
 * chestPainIntake.ts
 *
 * Deterministic, LLM-free intake script for the chest_pain pathway.
 *
 * SCOPE: intake questions ONLY — chief complaint → HPI → secondary →
 * modifying → allergies → medications. This module does NOT compute a
 * differential, disposition, or escalation; it only collects the patient's
 * answers in a fixed order. Disposition / red-flag triage remains the job of
 * the rule pipeline and runs elsewhere once intake is a solved foundation.
 *
 * Why deterministic: the legacy flow handed the conversation to GPT after a
 * few scripted turns, and the LLM re-asked questions whose answers it could
 * not reliably see as "already answered" — producing the observed loop
 * ("sweating?" → No → "sweating?"). Here every patient reply is recorded
 * against the exact question that was just asked (including a plain "No",
 * "nope", "none that I know of"), and the cursor only ever moves forward, so
 * re-asking a question is structurally impossible.
 */

export type IntakeSection =
  | "chief_complaint"
  | "hpi"
  | "secondary"
  | "modifying"
  | "allergies"
  | "medications";

export interface IntakeQuestion {
  id:      string;
  section: IntakeSection;
  field:   string;
  text:    string;
  kind:    "freetext" | "yesno" | "scale";
}

// The six ordered intake sections. `chief_complaint` is supplied by the
// patient's opening message (the complaint that started the conversation);
// the remaining five sections are covered by the scripted questions below.
export const INTAKE_SECTIONS: readonly IntakeSection[] = [
  "chief_complaint",
  "hpi",
  "secondary",
  "modifying",
  "allergies",
  "medications",
];

// Ordered question script. The opening complaint message is recorded as the
// chief complaint; the first scripted question begins the HPI.
export const CHEST_PAIN_INTAKE: readonly IntakeQuestion[] = [
  // ── History of present illness ────────────────────────────────────────────
  { id: "cp_hpi_onset",       section: "hpi", field: "onset",     kind: "freetext", text: "When did the chest pain start, and what were you doing at the time?" },
  { id: "cp_hpi_character",   section: "hpi", field: "character", kind: "freetext", text: "How would you describe the pain — is it sharp, dull, pressure, or squeezing?" },
  { id: "cp_hpi_location",    section: "hpi", field: "location",  kind: "freetext", text: "Where in your chest do you feel it most?" },
  { id: "cp_hpi_severity",    section: "hpi", field: "severity",  kind: "scale",    text: "On a scale of 1 to 10, how severe is the pain right now?" },

  // ── Secondary / associated symptoms ───────────────────────────────────────
  { id: "cp_sec_radiation",   section: "secondary", field: "radiation",   kind: "yesno", text: "Does the pain spread anywhere, such as your arm, jaw, neck, or back?" },
  { id: "cp_sec_dyspnea",     section: "secondary", field: "dyspnea",     kind: "yesno", text: "Are you having any shortness of breath?" },
  { id: "cp_sec_diaphoresis", section: "secondary", field: "diaphoresis", kind: "yesno", text: "Are you sweating or feeling clammy?" },
  { id: "cp_sec_nausea",      section: "secondary", field: "nausea",      kind: "yesno", text: "Any nausea or vomiting?" },

  // ── Modifying factors ─────────────────────────────────────────────────────
  { id: "cp_mod_worse",       section: "modifying", field: "worse",  kind: "freetext", text: "Does anything make the pain worse, like exertion, deep breaths, or movement?" },
  { id: "cp_mod_better",      section: "modifying", field: "better", kind: "freetext", text: "Does anything make the pain better, like rest or sitting still?" },

  // ── Allergies ─────────────────────────────────────────────────────────────
  { id: "cp_allergies",       section: "allergies", field: "allergies", kind: "freetext", text: "Do you have any allergies to medications? If so, which ones?" },

  // ── Medications ───────────────────────────────────────────────────────────
  { id: "cp_medications",     section: "medications", field: "medications", kind: "freetext", text: "Are you currently taking any medications? If so, which ones?" },
];

// Clean, non-escalating close. Intake only — no disposition language, no ER.
export const CHEST_PAIN_INTAKE_CLOSING =
  "Thanks — that's everything I need for now. I've recorded your answers and a clinician will review them. Take care.";

export interface IntakeState {
  // Number of scripted questions asked so far (also the index of the NEXT
  // scripted question). The question currently awaiting an answer is
  // CHEST_PAIN_INTAKE[asked - 1].
  asked:    number;
  answers:  Record<string, string>; // field → recorded answer (incl. chief_complaint)
  askedIds: string[];               // ids asked, in order (for audit/repro)
  done:     boolean;
}

const NEGATIVE_EXACT = new Set([
  "no", "nope", "nah", "naw", "n", "na", "n/a", "none", "no none",
  "nothing", "negative", "not really", "no not really", "no allergies",
  "no meds", "no medications", "not at all",
]);

const AFFIRMATIVE_EXACT = new Set([
  "yes", "yeah", "yep", "yup", "sure", "y", "correct", "right",
  "uh huh", "mhm", "i do", "definitely",
]);

function isNegative(s: string): boolean {
  if (!s) return false;
  if (NEGATIVE_EXACT.has(s)) return true;
  return /^(no\b|nope|nah\b|naw\b|none\b|not really|nothing|negative|not that i|none that i|i don.?t think|don.?t think|not at all|no,? )/.test(s);
}

function isAffirmative(s: string): boolean {
  if (AFFIRMATIVE_EXACT.has(s)) return true;
  return /^(yes|yeah|yep|yup|sure|correct|i do|i think so|definitely|yes,? )/.test(s);
}

/**
 * Interpret a patient reply against the question that was just asked, ALWAYS
 * returning a non-empty recorded value. A plain "No" / "nope" / "none that I
 * know of" is a valid, recorded answer — it never leaves the field blank,
 * which is exactly what kept the legacy flow looping.
 */
export function interpretAnswer(q: IntakeQuestion, text: string): string {
  const raw = String(text ?? "").trim();
  const s   = raw.toLowerCase();

  if (isNegative(s)) {
    // For allergies/medications a negative means "none"; otherwise "no".
    return (q.section === "allergies" || q.section === "medications") ? "none" : "no";
  }
  if (q.kind === "yesno" && isAffirmative(s)) return "yes";
  if (q.kind === "scale") {
    const num = s.match(/\b(10|[0-9])\b/);
    if (num) return num[1];
  }
  // Anything else — free text, an affirmative with detail, a med name — is
  // recorded verbatim so the field is set and the cursor advances.
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
