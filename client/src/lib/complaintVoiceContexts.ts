/**
 * complaintVoiceContexts.ts
 *
 * Returns QuestionContext arrays for any complaint so the LiveInterviewBar
 * can match patient speech against the exact form fields in use.
 *
 * Usage:
 *   const contexts = getContextsForComplaint(complaintId);
 *   const activeCtx = contexts.find(c => c.questionId === activeQuestionId);
 *   const result = capturePatientAnswer(speech, activeCtx);
 */

import { QUALITY_OPTIONS, ONSET_OPTIONS, type QuestionContext } from "./livePatientCapture";
import { ENCOUNTER_CONFIGS } from "@/data/encounterConfigs";

// Chest pain character fields → QUALITY_OPTIONS synonym map
const CHEST_QUALITY_SYNONYMS: Record<string, string[]> = {
  char_pressure: QUALITY_OPTIONS.find(o => o.value === "pressure_squeezing")?.synonyms ?? [],
  char_sharp:    QUALITY_OPTIONS.find(o => o.value === "sharp_stabbing")?.synonyms    ?? [],
  char_burning:  QUALITY_OPTIONS.find(o => o.value === "burning")?.synonyms            ?? [],
  char_aching:   QUALITY_OPTIONS.find(o => o.value === "aching_dull")?.synonyms        ?? [],
  char_tearing:  QUALITY_OPTIONS.find(o => o.value === "tearing_ripping")?.synonyms    ?? [],
};

// Generic synonym builder from label text
function labelToSynonyms(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[\s/(),\-–]+/)
    .filter(w => w.length > 2);
}

/**
 * Build a full QuestionContext array for the given complaint.
 * Every context uses the ACTUAL form field name as questionId so
 * applyResult() can write directly to inputs[questionId].
 */
export function getContextsForComplaint(complaintId: string): QuestionContext[] {
  const config = ENCOUNTER_CONFIGS[complaintId];
  if (!config) return [];

  const out: QuestionContext[] = [];

  // ── Section 2: Onset timing ──────────────────────────────────────────────
  if (config.onsetOptions && config.onsetOptions.length > 0) {
    out.push({
      questionId:   "onset_timing",
      questionText: "Onset timing — how did it start?",
      questionType: "chip_select",
      section:      2,
      isActive:     false,
      options: (config.onsetOptions as string[]).map(label => {
        // Try to reuse curated ONSET_OPTIONS synonyms when label matches
        const lower = label.toLowerCase();
        const preset = ONSET_OPTIONS.find(o =>
          lower.includes(o.value) || o.synonyms.some(s => lower.includes(s))
        );
        return {
          value:    label,  // stored verbatim in inputs.onset_timing
          label:    label,
          synonyms: preset?.synonyms ?? labelToSynonyms(label),
        };
      }),
    });
  }

  // ── Section 2: Severity scale ────────────────────────────────────────────
  if (config.hasSeverityScale) {
    out.push({
      questionId:   "severity",
      questionText: "Pain / symptom severity — 1 (mild) to 10 (worst ever)",
      questionType: "scale",
      section:      2,
      isActive:     false,
    });
  }

  // ── Section 2: Character / quality chips ─────────────────────────────────
  if (config.characters && config.characters.length > 0) {
    out.push({
      questionId:   "char_quality",
      questionText: "Character / quality — select all that apply",
      questionType: "chip_select",
      section:      2,
      isActive:     false,
      options: (config.characters as Array<{ field: string; label: string }>).map(ch => ({
        value:    ch.field,   // "char_pressure" — written directly to inputs
        label:    ch.label,
        synonyms: CHEST_QUALITY_SYNONYMS[ch.field] ?? labelToSynonyms(ch.label),
      })),
    });
  }

  // ── Section 2: HPI yes/no questions ─────────────────────────────────────
  for (const q of config.hpiQuestions ?? []) {
    out.push({
      questionId:   q.field,
      questionText: q.label,
      questionType: "boolean_pair",
      section:      2,
      isActive:     false,
    });
  }

  // ── Section 4: Review of Systems ─────────────────────────────────────────
  for (const q of config.rosQuestions ?? []) {
    out.push({
      questionId:   q.field,
      questionText: q.label,
      questionType: "boolean_pair",
      section:      4,
      isActive:     false,
    });
  }

  // ── Section 5: Past Medical History ──────────────────────────────────────
  for (const q of config.pmhQuestions ?? []) {
    out.push({
      questionId:   q.field,
      questionText: q.label,
      questionType: "boolean_pair",
      section:      5,
      isActive:     false,
    });
  }

  // ── Section 6: Family History ─────────────────────────────────────────────
  for (const q of config.fhxQuestions ?? []) {
    out.push({
      questionId:   q.field,
      questionText: q.label,
      questionType: "boolean_pair",
      section:      6,
      isActive:     false,
    });
  }

  // ── Section 7: Medications & Allergies ───────────────────────────────────
  for (const q of config.medsQuestions ?? []) {
    out.push({
      questionId:   q.field,
      questionText: q.label,
      questionType: "boolean_pair",
      section:      7,
      isActive:     false,
    });
  }

  return out;
}
