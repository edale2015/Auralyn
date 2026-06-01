/**
 * complaintBundle.ts
 *
 * Per-complaint precomputed data, cached at module level. Each bundle holds
 * the static-per-complaint fragments that conversationalEngine.extractAndRespond
 * rebuilds on every patient turn today: the goal list, the comma-joined
 * field-name strings, the JSON schema template, the system-prompt skeleton
 * fragments, and the question-library subset for fallbacks.
 *
 * Lifecycle:
 *   - prewarmComplaintBundles() — eager-populates the top-10 complaints at
 *     server startup so the first patient message hits a warm cache.
 *   - getComplaintBundle(slug) / prefetchComplaintBundle(slug) — read-through
 *     lookups used by sessions. O(1) on hit; builds-and-caches on miss.
 *
 * NO CLINICAL LOGIC IN THIS FILE. The bundle only stages strings + maps that
 * conversationalEngine already builds at runtime; the assembled prompts are
 * byte-identical. Safety gates, extraction rules, and disposition logic live
 * unchanged in conversationalEngine.ts.
 *
 * NO DATABASE READS. Every input here is a hardcoded module-level constant in
 * conversationalEngine.ts (COMPLAINT_GOALS, QUESTION_LIBRARY). The "fetch" is
 * a one-shot consolidation of those constants per slug.
 */

import {
  QUESTION_LIBRARY,
  getGoals,
  type ClinicalGoal,
} from "./conversationalEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Bundle shape
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplaintBundle {
  slug:                          string;
  goals:                         readonly ClinicalGoal[];
  /** Comma-separated list of all field keys. Embedded in system prompt. */
  fieldListCsv:                  string;
  /** Comma-separated list of safety field keys, or "(none)" if there are none. */
  safetyFieldListCsv:            string;
  /** JSON object template: `"field1":null,"field2":null,...` (no braces). */
  jsonSchemaTemplate:            string;
  /** Display string used in prompts (slug with underscores → spaces). */
  complaintDisplay:              string;
  /** System prompt fragment up to and including " any prose mention. " */
  systemPromptPrefix:            string;
  /** System prompt fragment from "\n\nRULES:" through the end (normal turn). */
  systemPromptSuffix:            string;
  /** System prompt fragment from "\n\nRULES:" through the end (first-message turn). */
  systemPromptSuffixFirstMsg:    string;
  /** Pre-written fallback question library entries for this slug. */
  questionLibrary:               Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static system-prompt fragments — identical for every complaint
// ─────────────────────────────────────────────────────────────────────────────
//
// The PROMPT_HEAD + safetyFieldListCsv + PROMPT_HEAD_AFTER_SAFETY_LIST string
// reproduces exactly what extractAndRespond used to build inline:
//
//   `You are Auralyn, ...\n\n` +
//   `EXTRACTION RULE — CRITICAL: ...\n\n` +
//   `SAFETY-FIELD RULE — CRITICAL: Safety fields (${safetyFieldList}) ` +
//   `trigger emergency escalation. ... any prose mention. ${safetyAskClause}`
//
// safetyAskClause is per-turn (it depends on isFirstMessage + pendingSafetyAsk)
// and is appended by extractAndRespond between prefix and suffix.

const PROMPT_HEAD =
  `You are Auralyn, a clinical intake assistant. Return ONLY valid JSON.\n\n` +
  `EXTRACTION RULE — CRITICAL: Set a field to true/false/value ONLY if the patient EXPLICITLY mentioned it. ` +
  `If not mentioned, set to null. NEVER guess or default to false/no for unstated fields.\n\n` +
  `SAFETY-FIELD RULE — CRITICAL: Safety fields (`;

const PROMPT_HEAD_AFTER_SAFETY_LIST =
  `) trigger emergency escalation. ` +
  `They may ONLY be set when the patient is directly answering the specific question we asked about that field. ` +
  `NEVER infer a safety field from the initial complaint, chat history, or any prose mention. `;

const PROMPT_TAIL_COMMON =
  `\n\nRULES:\n` +
  `1. Extract clinical fields from the patient message (boolean fields: true=yes, false=no, null=not mentioned).\n` +
  `2. Write "response": ONE short question, under 80 characters, warm tone.\n` +
  `3. Ask safety fields first, then other missing fields.\n` +
  `4. No jargon. No numbered lists. No line breaks.\n` +
  `FORBIDDEN in response (words followed by space containing "er " trigger false alerts):\n` +
  `  other→additional, better→improved, however→but, fever→high temperature,\n` +
  `  after→following, whether→if, over→past, ever→at any point, another→a second,\n` +
  `  together→combined, under→below, trigger→cause, tender→sore\n`;

const PROMPT_TAIL_FIRST_MSG =
  PROMPT_TAIL_COMMON + `FIRST MESSAGE: one warm direct question only.\n`;

// ─────────────────────────────────────────────────────────────────────────────
// Builder + cache
// ─────────────────────────────────────────────────────────────────────────────

function buildBundle(slug: string): ComplaintBundle {
  const goals               = getGoals(slug);
  const fieldListCsv        = goals.map(g => g.field).join(", ");
  const safetyFieldListCsv  = goals.filter(g => g.safety).map(g => g.field).join(", ") || "(none)";
  const jsonSchemaTemplate  = goals.map(g => `"${g.field}":null`).join(",");
  const complaintDisplay    = slug.replace(/_/g, " ");
  const questionLibrary     = QUESTION_LIBRARY[slug] ?? {};

  return {
    slug,
    goals,
    fieldListCsv,
    safetyFieldListCsv,
    jsonSchemaTemplate,
    complaintDisplay,
    systemPromptPrefix:         PROMPT_HEAD + safetyFieldListCsv + PROMPT_HEAD_AFTER_SAFETY_LIST,
    systemPromptSuffix:         PROMPT_TAIL_COMMON,
    systemPromptSuffixFirstMsg: PROMPT_TAIL_FIRST_MSG,
    questionLibrary,
  };
}

const complaintBundleCache = new Map<string, ComplaintBundle>();

/** Read-through bundle lookup. Builds-and-caches on miss. */
export function getComplaintBundle(slug: string): ComplaintBundle {
  let b = complaintBundleCache.get(slug);
  if (b) return b;
  b = buildBundle(slug);
  complaintBundleCache.set(slug, b);
  return b;
}

/** Explicit-prefetch alias for callers that want "compute now" semantics. */
export function prefetchComplaintBundle(slug: string): ComplaintBundle {
  return getComplaintBundle(slug);
}

export function complaintBundleCacheSize(): number {
  return complaintBundleCache.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup prewarm — top-10 complaints
// ─────────────────────────────────────────────────────────────────────────────
//
// These are the engine slugs (the keys used by COMPLAINT_GOALS / FIELD_TO_QID
// inside conversationalEngine.ts). Some of the user-friendly names map to
// different engine slug strings:
//   headache  → neuro_headache
//   uti       → gu_uti_symptoms
//   back_pain → msk_back_pain
//   rash      → derm_rash (no goals registered — bundle uses DEFAULT_GOALS)

const TOP_TEN_SLUGS: readonly string[] = [
  "cough",
  "neuro_headache",
  "sore_throat",
  "chest_pain",
  "gu_uti_symptoms",
  "msk_back_pain",
  "nausea",
  "derm_rash",
  "abdominal_pain",
  "dizziness",
];

export function prewarmComplaintBundles(): void {
  const t0 = Date.now();
  for (const slug of TOP_TEN_SLUGS) prefetchComplaintBundle(slug);
  console.log(
    `[ComplaintBundle] Prewarmed ${complaintBundleCache.size} bundles in ${Date.now() - t0}ms`,
  );
}
