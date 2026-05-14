/**
 * ClinicalStateExtractor.ts
 * Converts a raw dialogue answer log into a structured ExtractedClinicalState.
 * Pure extraction — no LLM calls. Used by AdaptiveDialogueEngine before pack evaluation.
 */

import { applyPHIGuard } from "../safety/PHIGuard";
import type { ExtractedClinicalState, AnswerEntry } from "./complaintPacks/types";

// ─── Normalisation helpers ────────────────────────────────────────────────────

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function isTruthy(v: string): boolean {
  return ["yes", "true", "1", "y", "yeah", "yep"].includes(norm(v));
}

function isFalsy(v: string): boolean {
  return ["no", "false", "0", "n", "nope", "nah", "not", "none"].some(n => norm(v).startsWith(n));
}

function parseNumeric(v: string): number | undefined {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? undefined : n;
}

// ─── Symptom key extraction from Q&A ─────────────────────────────────────────

function extractSymptomFromAnswer(
  extractKey: string,
  answer: string,
  symptoms: Record<string, boolean | number | string>
): void {
  const a = norm(answer);

  // Numeric scale answers
  const num = parseNumeric(answer);
  if (extractKey.endsWith("_days") || extractKey.endsWith("_score") || extractKey === "symptom_days") {
    if (num !== undefined) {
      symptoms[extractKey] = num;
      return;
    }
  }

  // Multichoice — store raw value too
  if (extractKey === "cough_type") {
    symptoms["cough"]            = !a.includes("no cough");
    symptoms["productive_cough"] = a.includes("wet") || a.includes("productive");
    return;
  }
  if (extractKey === "pain_location") {
    symptoms["epigastric_pain"]  = a.includes("upper middle") || a.includes("epigastric");
    symptoms["ruq_pain"]         = a.includes("upper right");
    symptoms["rlq_pain"]         = a.includes("lower right");
    symptoms["pelvic_pain"]      = a.includes("lower") || a.includes("pelvic");
    return;
  }
  if (extractKey === "pain_quality") {
    symptoms["crushing_pain"]    = a.includes("crush") || a.includes("squeezing");
    symptoms["tearing_pain"]     = a.includes("tear") || a.includes("rip");
    symptoms["burning_sensation"]= a.includes("burn");
    symptoms["pleuritic_pain"]   = a.includes("sharp");
    symptoms["pulsating"]        = a.includes("throb") || a.includes("pulsating");
    symptoms["pressure_tightening"] = a.includes("pressure") || a.includes("tighten");
    return;
  }
  if (extractKey === "onset_speed") {
    symptoms["sudden_onset"] = a.includes("sudden") || a.includes("seconds");
    return;
  }
  if (extractKey === "smoking") {
    // handled separately in demographics
    return;
  }

  // Boolean yesno
  if (isTruthy(answer)) {
    symptoms[extractKey] = true;
  } else if (isFalsy(answer)) {
    symptoms[extractKey] = false;
  } else {
    // Store raw for open answers
    symptoms[extractKey] = answer;
  }
}

// ─── Demographics extraction ─────────────────────────────────────────────────

function extractDemographics(
  answers: AnswerEntry[],
  state: Partial<ExtractedClinicalState>
): void {
  for (const { extractKey, answer } of (answers as any[])) {
    const a = norm(answer ?? "");
    if (extractKey === "smoking") {
      state.smokingStatus = a.includes("current") ? "current" : a.includes("former") ? "former" : "never";
    }
    if (extractKey === "pregnant" || extractKey === "possible_pregnancy") {
      state.pregnant = isTruthy(answer);
    }
    if (extractKey === "immunocompromised") {
      state.immunocompromised = isTruthy(answer);
    }
    if (extractKey === "pmh_pulm") {
      if (isTruthy(answer)) state.comorbidities!.push("asthma");
    }
    if (extractKey === "cardiac_risk_factors" && isTruthy(answer)) {
      ["hypertension", "diabetes", "hyperlipidemia"].forEach(c => {
        if (!state.comorbidities!.includes(c)) state.comorbidities!.push(c);
      });
    }
    if (extractKey === "prior_cad" && isTruthy(answer)) {
      if (!state.comorbidities!.includes("cad")) state.comorbidities!.push("cad");
      state.symptoms!["prior_cad"] = true;
    }
    if (extractKey === "htn_hx" && isTruthy(answer)) {
      if (!state.comorbidities!.includes("hypertension")) state.comorbidities!.push("hypertension");
    }
    if (extractKey === "alcohol_use") {
      const qty = parseNumeric(answer);
      if (qty && qty >= 3) {
        if (!state.comorbidities!.includes("alcohol_use")) state.comorbidities!.push("alcohol_use");
      }
    }
    if (extractKey === "prior_uti_count") {
      const count = parseNumeric(answer);
      if (count && count >= 3) state.symptoms!["recurrent_uti"] = true;
    }
  }
}

// ─── Vitals from free text ────────────────────────────────────────────────────

const TEMP_RE  = /(\d{2,3}(?:\.\d)?)\s*(?:degrees?|°|f|fahrenheit)/i;
const O2_RE    = /(?:o2|oxygen|sat(?:uration)?)[^\d]*(\d{2,3})%?/i;
const HR_RE    = /(?:hr|heart rate|pulse)[^\d]*(\d{2,3})/i;
const SBP_RE   = /(?:sbp|bp|blood pressure)[^\d]*(\d{2,3})\/?(\d{2,3})?/i;

function extractVitalsFromNarrative(text: string, state: Partial<ExtractedClinicalState>): void {
  const safe = applyPHIGuard(text);
  let m: RegExpMatchArray | null;
  if ((m = safe.match(TEMP_RE))  && !state.tempF)  state.tempF  = parseFloat(m[1]);
  if ((m = safe.match(O2_RE))    && !state.o2Sat)  state.o2Sat  = parseFloat(m[1]);
  if ((m = safe.match(HR_RE))    && !state.hrBpm)  state.hrBpm  = parseFloat(m[1]);
  if ((m = safe.match(SBP_RE))   && !state.sbp)  {
    state.sbp = parseFloat(m[1]);
    if (m[2]) state.dbp = parseFloat(m[2]);
  }
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export interface ExtractionInput {
  complaintId:   string;
  chiefComplaint: string;
  ageYears?:     number;
  sex?:          "male" | "female" | "other";
  answerLog:     AnswerEntry[];
  /** Optional pre-parsed vitals (e.g. from device) */
  vitals?: {
    tempF?:  number;
    o2Sat?:  number;
    hrBpm?:  number;
    sbp?:    number;
    dbp?:    number;
    rrBreaths?: number;
  };
}

export function extractClinicalState(input: ExtractionInput): ExtractedClinicalState {
  const state: ExtractedClinicalState = {
    complaintId:   input.complaintId,
    chiefComplaint: input.chiefComplaint,
    ageYears:      input.ageYears,
    sex:           input.sex,
    symptoms:      {},
    comorbidities: [],
    currentMeds:   [],
    allergies:     [],
    scores:        {},
    answerLog:     input.answerLog,
  };

  // Apply device vitals if provided
  if (input.vitals) {
    Object.assign(state, input.vitals);
  }

  // Process each answer
  for (const entry of input.answerLog) {
    // Try to extract vitals from free-text answers
    if (entry.answer && entry.answer.length > 5) {
      extractVitalsFromNarrative(entry.answer, state);
    }

    // Map extract key → symptom
    if (entry.extractKey) {
      extractSymptomFromAnswer(entry.extractKey, entry.answer, state.symptoms);
    }
  }

  // Extract demographics & comorbidities from answers
  extractDemographics(input.answerLog as any, state);

  // Infer age-related risk from ageYears
  if ((state.ageYears ?? 0) >= 65) {
    state.immunocompromised = state.immunocompromised ?? false;
  }

  // Build PHI-scrubbed narrative
  const rawNarrative = input.answerLog.map(e => `Q: ${e.questionText}\nA: ${e.answer}`).join("\n");
  state.narrativeScrubbed = applyPHIGuard(rawNarrative);

  return state;
}

// ─── Merge delta into existing state ─────────────────────────────────────────

export function mergeClinicalStateDelta(
  base: ExtractedClinicalState,
  newAnswers: AnswerEntry[]
): ExtractedClinicalState {
  const updated = { ...base, answerLog: [...base.answerLog, ...newAnswers], symptoms: { ...base.symptoms } };
  for (const entry of newAnswers) {
    if (entry.answer && entry.answer.length > 5) {
      extractVitalsFromNarrative(entry.answer, updated);
    }
    if (entry.extractKey) {
      extractSymptomFromAnswer(entry.extractKey, entry.answer, updated.symptoms);
    }
  }
  extractDemographics(newAnswers as any, updated);
  updated.narrativeScrubbed = applyPHIGuard(
    updated.answerLog.map(e => `Q: ${e.questionText}\nA: ${e.answer}`).join("\n")
  );
  return updated;
}
