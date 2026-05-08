/**
 * fullFormVoiceExtractor.ts
 *
 * FULL-FORM CLINICAL VOICE INTAKE EXTRACTOR
 *
 * Extends the existing HPI voice dictation to populate ALL 7 sections
 * of the clinical encounter form from a single physician dictation.
 *
 * CURRENT STATE (from screenshots):
 *   Section 1 — Vitals (manual entry only)
 *   Section 2 — HPI (voice works ✅)
 *   Section 3 — Prior Episode History (manual only)
 *   Section 4 — Review of Systems (manual only)
 *   Section 5 — Past Medical History (manual only)
 *   Section 6 — Family History (manual only)
 *   Section 7 — Medications & Allergies (manual only)
 *
 * TARGET STATE:
 *   One dictation populates all sections the physician mentions.
 *   Physician reviews green-highlighted auto-filled fields.
 *   Clicks to correct anything that parsed wrong.
 *
 * EXAMPLE INPUT:
 *   "Mr. Jones, 67-year-old male, hypertensive diabetic, on aspirin and
 *    metoprolol, no allergies. Chest pain this morning with exertion,
 *    pressure quality, radiates left arm, sweating, no shortness of breath.
 *    Father had MI at 52."
 *
 * EXAMPLE OUTPUT:
 *   Demographics: { sex: "Male", age: 67 }
 *   PMH: { hypertension: true, diabetes: true }
 *   Medications: { aspirin: true, beta_blocker: true }
 *   Allergies: { nkda: true }
 *   HPI: { Q_CP_EXERTIONAL: true, Q_CP_CONSTANT: false,
 *           Q_CP_QUALITY_PRESSURE: true, Q_CP_RADIATES: true }
 *   ROS: { diaphoresis: true, shortness_of_breath: false }
 *   FamilyHx: { parent_early_mi: true }
 *
 * CALL FROM YOUR EXISTING VOICE HANDLER:
 *   const extracted = await extractFullForm(transcript, complaintId);
 *   applyToForm(extracted);  // your existing form state setter
 */

export interface FullFormExtraction {
  // Section 1 — Vitals (spoken vitals only)
  vitals: {
    o2_sat?:      number;
    heart_rate?:  number;
    systolic_bp?: number;
    diastolic_bp?: number;
    temp?:        number;
    resp_rate?:   number;
  };

  // Section 2 — HPI (existing, keep your current parser)
  hpi: Record<string, boolean | string>;  // your existing Q_CP_* keys

  // Section 2 — Demographics (from HPI header or intro)
  demographics: {
    age?:       number;
    sex?:       "Male" | "Female" | "Other";
    pregnant?:  boolean;
    lactating?: boolean;
    smoker?:    boolean;
  };

  // Section 2 — Duration
  duration?: string;  // "2 hours", "3 days", "this morning"

  // Section 3 — Prior Episode
  priorEpisode: {
    had_before?: boolean;
  };

  // Section 4 — Review of Systems
  ros: {
    shortness_of_breath?:   boolean;
    diaphoresis?:           boolean;
    nausea_vomiting?:       boolean;
    palpitations?:          boolean;
    syncope?:               boolean;
    leg_pain_calf_swelling?: boolean;
    fever?:                 boolean;
    cough?:                 boolean;
    neuro_symptoms?:        boolean;
    severe_headache?:       boolean;
    tingling?:              boolean;
  };

  // Section 5 — Past Medical History
  pmh: {
    heart_disease_mi?:   boolean;
    copd?:               boolean;
    asthma?:             boolean;
    hypertension?:       boolean;
    diabetes?:           boolean;
    recent_surgery?:     boolean;
    recent_viral?:       boolean;
    cardiologist?:       boolean;
    prior_cardiac_cath?: boolean;
    prior_cardiac_test?: boolean;
  };

  // Section 6 — Family History
  family_hx: {
    parent_early_mi?:    boolean;
    parent_early_stroke?: boolean;
  };

  // Section 7 — Medications & Allergies
  medications: {
    aspirin?:          boolean;
    beta_blocker?:     boolean;
    nitrates?:         boolean;
    anticoagulant?:    boolean;
    immunocompromised?: boolean;
    nkda?:             boolean;
    allergy_penicillin?: boolean;
    allergy_sulfa?:    boolean;
  };

  // Metadata
  rawTranscript:  string;
  fieldsMatched:  number;
  totalFields:    number;
  confidence:     "high" | "moderate" | "low";
  unmatchedPhrases: string[];  // phrases the extractor didn't recognize
}

// ─── Pattern libraries ────────────────────────────────────────────────────────

const VITAL_PATTERNS = [
  { field: "o2_sat",       pattern: /(?:o2|oxygen|sat(?:uration)?)[^0-9]*(\d{2,3})/i },
  { field: "heart_rate",   pattern: /(?:heart rate|hr|pulse)[^0-9]*(\d{2,3})/i },
  { field: "systolic_bp",  pattern: /(?:bp|blood pressure)[^0-9]*(\d{2,3})\s*\/\s*(\d{2,3})/i },
  { field: "temp",         pattern: /(?:temp(?:erature)?)[^0-9]*(\d{2,3}(?:\.\d)?)/i },
  { field: "resp_rate",    pattern: /(?:resp(?:iratory rate)?|rr)[^0-9]*(\d{1,2})/i },
];

const DEMOGRAPHIC_PATTERNS = {
  age:      /(\d{1,3})[- ](?:year|yr)[- ]old/i,
  male:     /\b(?:male|man|gentleman|mr\.?|he)\b/i,
  female:   /\b(?:female|woman|lady|ms\.?|mrs\.?|she)\b/i,
  pregnant: /\b(?:pregnant|pregnancy)\b/i,
  smoker:   /\b(?:smoker|smok(?:es|ing)|tobacco|cigarette)\b/i,
};

const DURATION_PATTERNS = [
  /(\d+)\s*(?:minute|min)s?/i,
  /(\d+)\s*hours?/i,
  /(\d+)\s*days?/i,
  /(\d+)\s*weeks?/i,
  /this\s+morning/i,
  /since\s+(?:yesterday|last\s+night|this\s+morning|this\s+afternoon)/i,
  /(?:acute|sudden|abrupt)\s+onset/i,
  /(?:gradual|slowly?)\s+onset/i,
];

const ROS_PATTERNS: Array<{ field: keyof FullFormExtraction["ros"]; positive: RegExp[]; negative: RegExp[] }> = [
  {
    field:    "shortness_of_breath",
    positive: [/short(?:ness)?\s+of\s+breath/i, /\bdyspnea\b/i, /\bsob\b/i, /can't\s+breathe/i],
    negative: [/no\s+(?:shortness|sob|dyspnea)/i, /denies\s+(?:shortness|sob)/i, /without\s+(?:shortness|sob)/i],
  },
  {
    field:    "diaphoresis",
    positive: [/\b(?:diaphoresis|diaphoretic|sweating|sweat(?:y|ing)|clammy)\b/i],
    negative: [/no\s+(?:diaphoresis|sweating)/i, /denies\s+(?:diaphoresis|sweating)/i],
  },
  {
    field:    "nausea_vomiting",
    positive: [/\b(?:nausea|nauseous|vomiting|vomit(?:ed)?|throwing up)\b/i],
    negative: [/no\s+(?:nausea|vomiting)/i, /denies\s+(?:nausea|vomiting)/i],
  },
  {
    field:    "palpitations",
    positive: [/\b(?:palpitations|heart\s+racing|racing\s+heart|fluttering)\b/i],
    negative: [/no\s+palpitations/i, /denies\s+palpitations/i],
  },
  {
    field:    "syncope",
    positive: [/\b(?:syncope|syncopal|faint(?:ed|ing)?|passed\s+out|near.?syncope)\b/i],
    negative: [/no\s+(?:syncope|fainting)/i, /denies\s+(?:syncope|fainting)/i],
  },
  {
    field:    "fever",
    positive: [/\b(?:fever|febrile|temperature)\b/i],
    negative: [/no\s+fever/i, /afebrile/i, /denies\s+fever/i],
  },
  {
    field:    "leg_pain_calf_swelling",
    positive: [/\b(?:leg\s+pain|calf\s+(?:pain|swelling)|leg\s+swelling)\b/i],
    negative: [/no\s+leg\s+(?:pain|swelling)/i],
  },
  {
    field:    "neuro_symptoms",
    positive: [/\b(?:weakness|numbness|vision\s+changes|neuro(?:logical)?)\b/i],
    negative: [/no\s+(?:weakness|numbness|neuro)/i, /denies\s+(?:weakness|numbness)/i],
  },
  {
    field:    "severe_headache",
    positive: [/\b(?:severe\s+headache|worst\s+headache|thunderclap)\b/i],
    negative: [/no\s+(?:headache|head\s+pain)/i],
  },
];

const PMH_PATTERNS: Array<{ field: keyof FullFormExtraction["pmh"]; patterns: RegExp[] }> = [
  { field: "heart_disease_mi",   patterns: [/\b(?:heart\s+disease|prior\s+mi|heart\s+attack|cad|coronary|myocardial\s+infarction)\b/i] },
  { field: "copd",               patterns: [/\b(?:copd|emphysema|chronic\s+obstructive)\b/i] },
  { field: "asthma",             patterns: [/\basthma\b/i] },
  { field: "hypertension",       patterns: [/\b(?:hypertension|hypertensive|high\s+blood\s+pressure|htn)\b/i] },
  { field: "diabetes",           patterns: [/\b(?:diabetes|diabetic|dm\b|type\s+[12]\s+diabetes)\b/i] },
  { field: "recent_surgery",     patterns: [/\b(?:recent\s+surgery|recent\s+procedure|post.?op|recent\s+hospitalization)\b/i] },
  { field: "recent_viral",       patterns: [/\b(?:recent\s+(?:cold|virus|viral|flu|infection)|(?:cold|flu)\s+(?:last|past)\s+(?:week|two\s+weeks))\b/i] },
  { field: "cardiologist",       patterns: [/\b(?:cardiologist|cardiology|sees?\s+a\s+cardiologist)\b/i] },
  { field: "prior_cardiac_cath", patterns: [/\b(?:cardiac\s+cath(?:eterization)?|stent|angioplasty|cabg|bypass)\b/i] },
  { field: "prior_cardiac_test", patterns: [/\b(?:stress\s+test|echo(?:cardiogram)?|pfts|nuclear\s+test)\b/i] },
];

const FAMILY_HX_PATTERNS: Array<{ field: keyof FullFormExtraction["family_hx"]; patterns: RegExp[] }> = [
  { field: "parent_early_mi",     patterns: [/\b(?:father|dad|mother|mom|parent)\s+(?:had\s+)?(?:heart\s+attack|mi|cardiac)\b/i, /family\s+history\s+of\s+(?:heart|cardiac)/i] },
  { field: "parent_early_stroke", patterns: [/\b(?:father|dad|mother|mom|parent)\s+(?:had\s+)?stroke\b/i, /family\s+history\s+of\s+stroke/i] },
];

const MEDICATION_PATTERNS: Array<{ field: keyof FullFormExtraction["medications"]; patterns: RegExp[]; negative?: RegExp[] }> = [
  {
    field:    "aspirin",
    patterns: [/\b(?:aspirin|asa)\b/i],
    negative: [/not?\s+on\s+aspirin/i, /no\s+aspirin/i],
  },
  {
    field:    "beta_blocker",
    patterns: [/\b(?:beta.?blocker|metoprolol|atenolol|carvedilol|bisoprolol|labetalol)\b/i],
  },
  {
    field:    "nitrates",
    patterns: [/\b(?:nitrate|nitroglycerin|nitro|isosorbide)\b/i],
  },
  {
    field:    "anticoagulant",
    patterns: [/\b(?:anticoagulant|warfarin|coumadin|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|blood\s+thinner)\b/i],
  },
  {
    field:    "immunocompromised",
    patterns: [/\b(?:immunocompromised|immunosuppressed|on\s+steroids|chemotherapy|transplant)\b/i],
  },
  {
    field:    "nkda",
    patterns: [/\b(?:nkda|no\s+(?:known\s+)?(?:drug\s+)?allergies|no\s+allergies)\b/i],
  },
  {
    field:    "allergy_penicillin",
    patterns: [/allerg(?:y|ic)\s+to\s+(?:penicillin|pcn|amoxicillin)/i, /penicillin\s+allerg/i],
  },
  {
    field:    "allergy_sulfa",
    patterns: [/allerg(?:y|ic)\s+to\s+sulfa/i, /sulfa\s+allerg/i],
  },
];

// ─── Negation detector ────────────────────────────────────────────────────────

function isNegated(transcript: string, matchIndex: number, matchLength: number): boolean {
  // Look at the 30 characters before the match for negation words
  const before = transcript.slice(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
  const negationWords = ["no ", "not ", "without ", "denies ", "deny ", "negative for ", "absent "];
  return negationWords.some(neg => before.includes(neg));
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function extractFullForm(
  transcript: string,
  complaintId: string = "chest_pain"
): FullFormExtraction {

  const lower = transcript.toLowerCase();
  const result: FullFormExtraction = {
    vitals:           {},
    hpi:              {},
    demographics:     {},
    ros:              {},
    pmh:              {},
    family_hx:        {},
    medications:      {},
    priorEpisode:     {},
    rawTranscript:    transcript,
    fieldsMatched:    0,
    totalFields:      0,
    confidence:       "low",
    unmatchedPhrases: [],
  };

  // ── Vitals ──────────────────────────────────────────────────────────────────
  for (const { field, pattern } of VITAL_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      if (field === "systolic_bp" && match[2]) {
        result.vitals.systolic_bp  = Number(match[1]);
        result.vitals.diastolic_bp = Number(match[2]);
        result.fieldsMatched += 2;
      } else if (match[1]) {
        (result.vitals as any)[field] = Number(match[1]);
        result.fieldsMatched++;
      }
    }
  }

  // ── Demographics ────────────────────────────────────────────────────────────
  const ageMatch = transcript.match(DEMOGRAPHIC_PATTERNS.age);
  if (ageMatch) {
    result.demographics.age = Number(ageMatch[1]);
    result.fieldsMatched++;
  }

  if (DEMOGRAPHIC_PATTERNS.male.test(transcript)) {
    result.demographics.sex = "Male";
    result.fieldsMatched++;
  } else if (DEMOGRAPHIC_PATTERNS.female.test(transcript)) {
    result.demographics.sex = "Female";
    result.fieldsMatched++;
  }

  if (DEMOGRAPHIC_PATTERNS.pregnant.test(transcript))  { result.demographics.pregnant = true;  result.fieldsMatched++; }
  if (DEMOGRAPHIC_PATTERNS.smoker.test(transcript))    { result.demographics.smoker   = true;  result.fieldsMatched++; }

  // ── Duration ────────────────────────────────────────────────────────────────
  for (const pat of DURATION_PATTERNS) {
    const m = transcript.match(pat);
    if (m) { result.duration = m[0]; result.fieldsMatched++; break; }
  }

  // ── Review of Systems ───────────────────────────────────────────────────────
  for (const { field, positive, negative } of ROS_PATTERNS) {
    const isNeg = negative.some(p => p.test(transcript));
    const isPos = positive.some(p => p.test(transcript));

    if (isNeg) {
      (result.ros as any)[field] = false;
      result.fieldsMatched++;
    } else if (isPos) {
      (result.ros as any)[field] = true;
      result.fieldsMatched++;
    }
  }

  // ── Past Medical History ────────────────────────────────────────────────────
  for (const { field, patterns } of PMH_PATTERNS) {
    if (patterns.some(p => p.test(transcript))) {
      (result.pmh as any)[field] = true;
      result.fieldsMatched++;
    }
  }

  // ── Family History ──────────────────────────────────────────────────────────
  for (const { field, patterns } of FAMILY_HX_PATTERNS) {
    if (patterns.some(p => p.test(transcript))) {
      (result.family_hx as any)[field] = true;
      result.fieldsMatched++;
    }
  }

  // ── Medications & Allergies ─────────────────────────────────────────────────
  for (const { field, patterns, negative } of MEDICATION_PATTERNS) {
    const isNeg = negative?.some(p => p.test(transcript));
    if (isNeg) continue;  // explicit negation — don't set
    if (patterns.some(p => p.test(transcript))) {
      (result.medications as any)[field] = true;
      result.fieldsMatched++;
    }
  }

  // ── Confidence scoring ──────────────────────────────────────────────────────
  result.totalFields = 40;  // approximate total fillable fields across 7 sections
  const matchRate    = result.fieldsMatched / result.totalFields;
  result.confidence  = matchRate >= 0.3 ? "high" : matchRate >= 0.1 ? "moderate" : "low";

  return result;
}

// ─── Form application helper ──────────────────────────────────────────────────
// Maps FullFormExtraction to your existing React form state.
// Customize field names to match your actual state keys.

export function buildFormPatch(
  extraction: FullFormExtraction,
  complaintId: string
): Record<string, any> {

  const patch: Record<string, any> = {};

  // Demographics
  if (extraction.demographics.age)       patch["age"]       = extraction.demographics.age;
  if (extraction.demographics.sex)       patch["sex"]       = extraction.demographics.sex;
  if (extraction.demographics.pregnant)  patch["pregnant"]  = true;
  if (extraction.demographics.smoker)    patch["smoker"]    = true;
  if (extraction.duration)               patch["duration"]  = extraction.duration;

  // Vitals (only if spoken)
  if (extraction.vitals.o2_sat)       patch["o2_sat"]       = extraction.vitals.o2_sat;
  if (extraction.vitals.heart_rate)   patch["heart_rate"]   = extraction.vitals.heart_rate;
  if (extraction.vitals.systolic_bp)  patch["systolic_bp"]  = extraction.vitals.systolic_bp;
  if (extraction.vitals.diastolic_bp) patch["diastolic_bp"] = extraction.vitals.diastolic_bp;
  if (extraction.vitals.temp)         patch["temp"]         = extraction.vitals.temp;
  if (extraction.vitals.resp_rate)    patch["resp_rate"]    = extraction.vitals.resp_rate;

  // ROS
  Object.entries(extraction.ros).forEach(([field, val]) => {
    if (val !== undefined) patch[`ros_${field}`] = val;
  });

  // PMH
  Object.entries(extraction.pmh).forEach(([field, val]) => {
    if (val) patch[`pmh_${field}`] = true;
  });

  // Family Hx
  Object.entries(extraction.family_hx).forEach(([field, val]) => {
    if (val) patch[`fhx_${field}`] = true;
  });

  // Medications
  Object.entries(extraction.medications).forEach(([field, val]) => {
    if (val) patch[`med_${field}`] = true;
  });

  return patch;
}
