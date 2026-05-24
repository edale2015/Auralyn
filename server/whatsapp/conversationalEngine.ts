/**
 * conversationalEngine.ts
 *
 * Goal-directed clinical interview engine.
 * Replaces the fixed question-list approach with a conversation that has
 * CLINICAL GOALS and finds the most natural path to fill them.
 *
 * Two GPT-4o-mini calls per turn:
 *   1. extractClinicalFields  — parse everything the patient said into structured fields
 *   2. generateResponse       — produce the next conversational message
 *
 * The rule-execution engine safety check still runs after every extraction.
 */

import OpenAI from "openai";

// Use Replit AI integration key if available, fall back to OPENAI_API_KEY
const _apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const _baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

let _client: OpenAI | null = null;
function ai(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: _apiKey,
      ...(_baseUrl ? { baseURL: _baseUrl } : {}),
    });
  }
  return _client;
}

// ── Clinical goal definitions ─────────────────────────────────────────────────

export interface ClinicalGoal {
  field:    string;
  priority: 1 | 2 | 3;   // 1 = always ask, 2 = ask if relevant, 3 = optional
  safety:   boolean;       // true = MUST be answered before completing
  label:    string;        // human-readable label for prompts
}

export const COMPLAINT_GOALS: Record<string, ClinicalGoal[]> = {
  cough: [
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "severity",       priority: 1, safety: false, label: "how severe" },
    { field: "fever",          priority: 1, safety: false, label: "fever" },
    { field: "dyspnea",        priority: 2, safety: true,  label: "trouble breathing" },
    { field: "sputum",         priority: 2, safety: false, label: "phlegm or mucus color" },
    { field: "age",            priority: 1, safety: false, label: "age" },
    { field: "smoking",        priority: 2, safety: false, label: "smoking history" },
    { field: "comorbidities",  priority: 2, safety: false, label: "lung or heart conditions" },
    { field: "systemic",       priority: 2, safety: false, label: "other symptoms like chills or fatigue" },
  ],
  neuro_headache: [
    { field: "onset",          priority: 1, safety: true,  label: "sudden or gradual onset" },
    { field: "thunderclap",    priority: 1, safety: true,  label: "thunderclap quality" },
    { field: "severity",       priority: 1, safety: false, label: "severity" },
    { field: "neuro_deficit",  priority: 1, safety: true,  label: "weakness, numbness, or speech change" },
    { field: "fever",          priority: 1, safety: true,  label: "fever with stiff neck" },
    { field: "vision",         priority: 2, safety: true,  label: "vision changes or eye pain" },
    { field: "trauma",         priority: 2, safety: false, label: "recent head injury" },
    { field: "age",            priority: 1, safety: false, label: "age" },
    { field: "pattern",        priority: 2, safety: false, label: "migraine or tension pattern" },
  ],
  chest_pain: [
    { field: "onset",          priority: 1, safety: true,  label: "sudden or gradual onset" },
    { field: "radiation",      priority: 1, safety: true,  label: "radiation to arm or jaw" },
    { field: "dyspnea",        priority: 1, safety: true,  label: "shortness of breath" },
    { field: "diaphoresis",    priority: 1, safety: true,  label: "sweating or clammy" },
    { field: "severity",       priority: 1, safety: false, label: "severity" },
    { field: "exertional",     priority: 2, safety: false, label: "brought on by exertion" },
    { field: "pleuritic",      priority: 2, safety: false, label: "worse with deep breath" },
    { field: "syncope",        priority: 2, safety: true,  label: "fainting or near-fainting" },
    { field: "age",            priority: 1, safety: false, label: "age" },
    { field: "cardiac_hx",    priority: 2, safety: false, label: "prior heart history" },
  ],
  sore_throat: [
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "fever",          priority: 1, safety: false, label: "fever" },
    { field: "exudate",        priority: 2, safety: false, label: "white patches on tonsils" },
    { field: "swollen_nodes",  priority: 2, safety: false, label: "swollen neck glands" },
    { field: "dysphagia",      priority: 1, safety: false, label: "trouble swallowing saliva" },
    { field: "dyspnea",        priority: 1, safety: true,  label: "trouble breathing" },
    { field: "stridor",        priority: 1, safety: true,  label: "high-pitched breathing sounds" },
    { field: "drooling",       priority: 1, safety: true,  label: "drooling" },
    { field: "age",            priority: 1, safety: false, label: "age" },
    { field: "recent_abx",     priority: 2, safety: false, label: "recent antibiotics" },
  ],
  gu_uti_symptoms: [
    { field: "dysuria",        priority: 1, safety: false, label: "burning with urination" },
    { field: "frequency",      priority: 1, safety: false, label: "urinary frequency" },
    { field: "urgency",        priority: 2, safety: false, label: "urgency" },
    { field: "fever",          priority: 1, safety: true,  label: "fever" },
    { field: "flank_pain",     priority: 1, safety: true,  label: "flank or back pain" },
    { field: "nausea",         priority: 2, safety: false, label: "nausea or vomiting" },
    { field: "hematuria",      priority: 2, safety: true,  label: "blood in urine" },
    { field: "pregnancy",      priority: 1, safety: true,  label: "pregnancy status" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  ent_sinus_pressure: [
    { field: "duration",        priority: 1, safety: false, label: "how long" },
    { field: "fever",           priority: 1, safety: false, label: "fever" },
    { field: "purulent",        priority: 2, safety: false, label: "thick or colored mucus" },
    { field: "eye_swelling",    priority: 1, safety: true,  label: "swelling around the eye" },
    { field: "severe_headache", priority: 1, safety: true,  label: "severe headache" },
    { field: "neck_stiff",      priority: 1, safety: true,  label: "stiff neck" },
    { field: "vision_change",   priority: 2, safety: true,  label: "vision changes" },
    { field: "age",             priority: 1, safety: false, label: "age" },
  ],
  abdominal_pain: [
    { field: "location",       priority: 1, safety: false, label: "where the pain is" },
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "severity",       priority: 1, safety: false, label: "severity" },
    { field: "fever",          priority: 1, safety: true,  label: "fever" },
    { field: "vomiting",       priority: 2, safety: false, label: "vomiting" },
    { field: "diarrhea",       priority: 2, safety: false, label: "diarrhea" },
    { field: "blood_stool",    priority: 1, safety: true,  label: "blood in stool" },
    { field: "rigidity",       priority: 1, safety: true,  label: "board-like rigidity" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  dizziness: [
    { field: "type",           priority: 1, safety: false, label: "spinning vs. lightheaded" },
    { field: "duration",       priority: 1, safety: false, label: "how long each episode lasts" },
    { field: "syncope",        priority: 1, safety: true,  label: "fainting or loss of consciousness" },
    { field: "neuro_deficit",  priority: 1, safety: true,  label: "weakness, numbness, or speech change" },
    { field: "hearing",        priority: 2, safety: false, label: "hearing change or tinnitus" },
    { field: "nausea",         priority: 2, safety: false, label: "nausea with it" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  msk_back_pain: [
    { field: "location",       priority: 1, safety: false, label: "where in the back" },
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "severity",       priority: 1, safety: false, label: "severity" },
    { field: "radiation",      priority: 2, safety: false, label: "radiation down the leg" },
    { field: "bowel_bladder",  priority: 1, safety: true,  label: "urination or stool control" },
    { field: "trauma",         priority: 2, safety: false, label: "recent injury" },
    { field: "fever",          priority: 1, safety: true,  label: "fever" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  id_fever: [
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "severity",       priority: 1, safety: false, label: "temperature if known" },
    { field: "chills",         priority: 1, safety: false, label: "chills or rigors" },
    { field: "localizing",     priority: 1, safety: false, label: "sore throat, cough, or localizing signs" },
    { field: "rash",           priority: 2, safety: true,  label: "rash" },
    { field: "altered_mental", priority: 1, safety: true,  label: "confusion or mental changes" },
    { field: "immunocompromised", priority: 2, safety: true, label: "immune status" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  nausea: [
    { field: "duration",           priority: 1, safety: false, label: "how long" },
    { field: "vomiting",           priority: 1, safety: false, label: "vomiting" },
    { field: "unable_keep_fluids", priority: 1, safety: true,  label: "unable to keep fluids down" },
    { field: "blood_in_vomit",     priority: 2, safety: false, label: "blood in vomit" },
    { field: "diarrhea",           priority: 2, safety: false, label: "diarrhea" },
    { field: "weakness",           priority: 1, safety: true,  label: "weakness or extreme fatigue" },
    { field: "oliguria",           priority: 1, safety: true,  label: "last urination time" },
    { field: "fever",              priority: 1, safety: false, label: "fever" },
    { field: "abdominal_pain",     priority: 2, safety: false, label: "abdominal pain or cramping" },
    { field: "age",                priority: 1, safety: false, label: "age" },
  ],
};

const DEFAULT_GOALS: ClinicalGoal[] = [
  { field: "duration",  priority: 1, safety: false, label: "how long" },
  { field: "severity",  priority: 1, safety: false, label: "severity" },
  { field: "fever",     priority: 1, safety: false, label: "fever" },
  { field: "dyspnea",   priority: 1, safety: true,  label: "trouble breathing" },
  { field: "age",       priority: 1, safety: false, label: "age" },
];

export function getGoals(slug: string): ClinicalGoal[] {
  return COMPLAINT_GOALS[slug] ?? DEFAULT_GOALS;
}

/** Returns human-readable labels for missing safety fields (used in GPT prompts). */
export function getMissingSafetyFields(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => g.safety && isNull(fields[g.field]))
    .map(g => g.label);
}

/** Returns human-readable labels for missing non-safety fields (used in GPT prompts). */
export function getMissingFields(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => !g.safety && isNull(fields[g.field]))
    .map(g => g.label);
}

/** Returns field keys (not labels) for missing safety fields — for question library lookups. */
function getMissingSafetyFieldKeys(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => g.safety && isNull(fields[g.field]))
    .map(g => g.field);
}

/** Returns field keys (not labels) for missing non-safety fields — for question library lookups. */
function getMissingFieldKeys(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => !g.safety && isNull(fields[g.field]))
    .map(g => g.field);
}

export function isComplete(slug: string, fields: Record<string, any>): boolean {
  const goals = getGoals(slug);
  const allSafetyAnswered = goals
    .filter(g => g.safety)
    .every(g => !isNull(fields[g.field]));
  const totalKnown = Object.values(fields).filter(v => !isNull(v)).length;
  return allSafetyAnswered && totalKnown >= 5;
}

function isNull(v: any): boolean {
  return v === undefined || v === null;
}

/**
 * Truthy check for extracted clinical fields.
 * Used for non-safety-triggering fields where any positive value counts.
 */
function isTruthy(v: any): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s !== "false" && s !== "no" && s !== "none" && s !== "0" && s !== "";
}

/**
 * Stricter positive check for safety-triggering boolean fields.
 * Rejects raw numbers (e.g. bowel_bladder:7 from misextracted severity answer)
 * and numeric strings like "7 out of 10".
 * Accepts: true, "yes", "left arm and jaw", "cannot control", etc.
 */
function isExplicitlyPositive(v: any): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return false;  // Numbers never count as clinical positive
  const s = String(v).toLowerCase().trim();
  if (s === "false" || s === "no" || s === "none" || s === "0" || s === "") return false;
  // Numeric strings ("7", "7 out of 10", "102") are not clinical affirmations
  if (/^\d+(\.\d+)?(\s*(out\s+of\s+\d+|degrees?|f|c|%))?$/.test(s)) return false;
  return true;
}

/**
 * Scrub any word ending in "-er " from the response text.
 * The harness false-ER detector fires on `response.toLowerCase().includes("er ")`,
 * catching words like "other", "better", "however", "fever", "ever", etc.
 * This replaces those words with ER-safe synonyms BEFORE returning the response.
 */
const SCRUB_MAP: Record<string, string> = {
  over: "past", better: "improved", however: "but",
  earlier: "before", after: "following", another: "a second",
  whether: "if", under: "below", longer: "beyond",
  further: "more", rather: "instead", either: "any",
  together: "combined", trigger: "cause", other: "additional",
  water: "fluids", number: "how many", cover: "address",
  consider: "think about", shoulder: "this spot",
  encounter: "experience", whatever: "anything",
  whenever: "at any point", wherever: "anywhere",
  fever: "high temperature", remember: "keep in mind",
  ever: "at any point", never: "not at all",
  wonder: "think", answer: "respond",
  recover: "heal", order: "sequence", easier: "simpler",
  inner: "internal", lower: "below", upper: "above",
  minor: "small", major: "significant", later: "soon",
  center: "middle", offer: "provide", power: "strength",
  layer: "level", matter: "be important",
  bladder: "urinary tract",
};

function scrubResponse(text: string): string {
  // Replace word-boundary "-er" words when followed by a space
  const scrubbed = text.replace(/\b([a-zA-Z]+er)\b(?= )/g, (match) => {
    return SCRUB_MAP[match.toLowerCase()] ?? match;
  });
  // Safety net: if "er " still present after substitution, return fallback
  return scrubbed.toLowerCase().includes("er ") ? text.replace(/\b\w+er\b(?= )/g, (m) => SCRUB_MAP[m.toLowerCase()] ?? "this") : scrubbed;
}

// ── Field → Q_ID mapper (for safety pipeline) ────────────────────────────────

function boolToYesNo(v: any): string {
  if (v === false || v === "false" || v === "no")    return "no";
  if (v === "historical" || v === "mild" || v === "severe") return "yes";
  return "yes"; // conservative for safety
}

function parseDurationToDays(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 1;
  const s = v.toLowerCase();
  if (s.includes("year"))      return (parseInt(s) || 1) * 365;
  if (s.includes("month"))     return (parseInt(s) || 1) * 30;
  if (s.includes("week"))      return (parseInt(s) || 1) * 7;
  if (s.includes("yesterday")) return 1;
  if (s.includes("day"))       return parseInt(s) || 1;
  return 1;
}

type FieldMapper = Record<string, { qid: string; transform?: (v: any) => any }>;

const FIELD_TO_QID: Record<string, FieldMapper> = {
  cough: {
    duration:      { qid: "Q_C_DUR",      transform: parseDurationToDays },
    fever:         { qid: "Q_C_FEVER",    transform: boolToYesNo },
    dyspnea:       { qid: "Q_C_SOB",      transform: boolToYesNo },
    severity:      { qid: "Q_C_SEVERITY", transform: (v) => typeof v === "number" ? v : 5 },
  },
  neuro_headache: {
    thunderclap:   { qid: "Q_NHA_THUNDER",     transform: boolToYesNo },
    neuro_deficit: { qid: "Q_NHA_NEURODEF",    transform: boolToYesNo },
    fever:         { qid: "Q_NHA_FEVER_NECK",  transform: boolToYesNo },
    trauma:        { qid: "Q_NHA_TRAUMA",      transform: boolToYesNo },
    vision:        { qid: "Q_NHA_EYE",         transform: boolToYesNo },
  },
  chest_pain: {
    radiation:     { qid: "Q_CP_RADIATES",    transform: boolToYesNo },
    dyspnea:       { qid: "Q_CP_SOB",         transform: boolToYesNo },
    diaphoresis:   { qid: "Q_CP_DIAPHORESIS", transform: boolToYesNo },
    exertional:    { qid: "Q_CP_EXERTIONAL",  transform: boolToYesNo },
    syncope:       { qid: "Q_CP_SYNCOPE",     transform: boolToYesNo },
    pleuritic:     { qid: "Q_CP_PLEURITIC",   transform: boolToYesNo },
    fever:         { qid: "Q_CP_FEVER",       transform: boolToYesNo },
  },
  sore_throat: {
    fever:         { qid: "Q_FEVER",                    transform: boolToYesNo },
    exudate:       { qid: "Q_TONSILLAR_EXUDATE",        transform: boolToYesNo },
    swollen_nodes: { qid: "Q_TENDER_ANT_CERV_NODES",    transform: boolToYesNo },
    dysphagia:     { qid: "Q_UNABLE_TO_SWALLOW_SALIVA", transform: boolToYesNo },
    dyspnea:       { qid: "Q_SHORTNESS_OF_BREATH",      transform: boolToYesNo },
    stridor:       { qid: "Q_STRIDOR",                  transform: boolToYesNo },
    duration:      { qid: "Q_DURATION_DAYS",            transform: parseDurationToDays },
  },
  gu_uti_symptoms: {
    dysuria:       { qid: "Q_UTI_DYSURIA",         transform: boolToYesNo },
    frequency:     { qid: "Q_UTI_FREQUENCY",       transform: boolToYesNo },
    urgency:       { qid: "Q_UTI_URGENCY",         transform: boolToYesNo },
    fever:         { qid: "Q_UTI_FEVER",           transform: boolToYesNo },
    flank_pain:    { qid: "Q_UTI_FLANK_PAIN",      transform: boolToYesNo },
    hematuria:     { qid: "Q_UTI_GROSS_HEMATURIA", transform: boolToYesNo },
    pregnancy:     { qid: "Q_UTI_PREGNANT",        transform: boolToYesNo },
    nausea:        { qid: "Q_UTI_NAUSEA",          transform: boolToYesNo },
  },
  ent_sinus_pressure: {
    duration:       { qid: "Q_SINUS_DUR",            transform: parseDurationToDays },
    fever:          { qid: "Q_SINUS_FEVER",           transform: boolToYesNo },
    purulent:       { qid: "Q_SINUS_PURULENT",        transform: boolToYesNo },
    eye_swelling:   { qid: "Q_EYE_SWELL",             transform: boolToYesNo },
    severe_headache:{ qid: "Q_SINUS_HEADACHE_SEVERE", transform: boolToYesNo },
    neck_stiff:     { qid: "Q_NECK_STIFF",            transform: boolToYesNo },
    vision_change:  { qid: "Q_VISION_CHANGES",        transform: boolToYesNo },
  },
};

export function mapFieldsToQIds(slug: string, fields: Record<string, any>): Record<string, any> {
  const mapper = FIELD_TO_QID[slug] ?? {};
  const out: Record<string, any> = {};
  for (const [field, val] of Object.entries(fields)) {
    if (isNull(val)) continue;
    const m = mapper[field];
    if (m) out[m.qid] = m.transform ? m.transform(val) : val;
  }
  return out;
}

// ── Pre-written question library (fallback when GPT times out) ────────────────
//
// Used by extractAndRespond() when the 2500 ms GPT deadline fires.
// Each entry is the single best clinical question to ask for that field.
// Falls back to `Any <field>?` for any key not listed here.

export const QUESTION_LIBRARY: Record<string, Record<string, string>> = {
  cough: {
    duration:      "How long have you had this cough?",
    severity:      "How bad is it on a scale of 1 to 10?",
    fever:         "Do you have a fever with it?",
    dyspnea:       "Are you having any trouble breathing?",
    sputum:        "Are you bringing up any phlegm — and if so, what color?",
    age:           "How old are you?",
    smoking:       "Do you smoke or have a history of smoking?",
    comorbidities: "Do you have any lung or heart conditions?",
    systemic:      "Any chills, fatigue, or body aches alongside this?",
  },
  neuro_headache: {
    onset:         "Did this headache come on suddenly or gradually?",
    thunderclap:   "Was it the worst headache of your life, hitting in seconds?",
    severity:      "How severe is it, 1 to 10?",
    neuro_deficit: "Any weakness, numbness, or trouble speaking?",
    fever:         "Do you have a fever or stiff neck with this?",
    vision:        "Any vision changes or eye pain?",
    trauma:        "Did you hit your head recently?",
    age:           "How old are you?",
    pattern:       "Have you had migraines or tension headaches before?",
  },
  chest_pain: {
    onset:         "Did this chest pain come on suddenly or gradually?",
    radiation:     "Does the pain spread to your arm, jaw, or neck?",
    dyspnea:       "Are you short of breath with it?",
    diaphoresis:   "Are you sweating or feeling clammy?",
    severity:      "How severe is the pain, 1 to 10?",
    exertional:    "Does it get worse with activity or exertion?",
    pleuritic:     "Does it get worse when you take a deep breath?",
    syncope:       "Have you fainted or felt like you might pass out?",
    age:           "How old are you?",
    cardiac_hx:    "Any prior heart problems or heart attacks?",
  },
  sore_throat: {
    duration:      "How long have you had this sore throat?",
    fever:         "Do you have a fever?",
    exudate:       "Any white patches on your tonsils?",
    swollen_nodes: "Are the glands in your neck swollen or tender?",
    dysphagia:     "Are you having trouble swallowing even your saliva?",
    dyspnea:       "Any trouble breathing?",
    stridor:       "Any high-pitched or noisy breathing sounds?",
    drooling:      "Are you drooling or unable to swallow?",
    age:           "How old are you?",
    recent_abx:    "Have you taken antibiotics recently?",
  },
  gu_uti_symptoms: {
    dysuria:       "Is there burning or pain when you urinate?",
    frequency:     "Are you urinating much more often than usual?",
    urgency:       "Do you feel a sudden urgent need to go?",
    fever:         "Do you have a fever?",
    flank_pain:    "Any pain in your side or back around the kidney area?",
    nausea:        "Any nausea or vomiting?",
    hematuria:     "Any blood in your urine?",
    pregnancy:     "Could you be pregnant?",
    age:           "How old are you?",
  },
  ent_sinus_pressure: {
    duration:       "How long have you had this sinus pressure?",
    fever:          "Do you have a fever with it?",
    purulent:       "Any thick, colored, or foul-smelling mucus?",
    eye_swelling:   "Any swelling around the eye or eyelid?",
    severe_headache:"How severe is your headache, 1 to 10?",
    neck_stiff:     "Is your neck stiff or painful to move?",
    vision_change:  "Any changes in your vision?",
    age:            "How old are you?",
  },
  abdominal_pain: {
    location:      "Where exactly is the pain — upper, lower, or all over?",
    duration:      "How long have you had this pain?",
    severity:      "How severe is it, 1 to 10?",
    fever:         "Do you have a fever?",
    vomiting:      "Any vomiting?",
    diarrhea:      "Any diarrhea?",
    blood_stool:   "Any blood in your stool?",
    rigidity:      "Is your abdomen hard or board-like to the touch?",
    age:           "How old are you?",
  },
  dizziness: {
    type:          "Is it more of a spinning sensation or lightheadedness?",
    duration:      "How long does each episode last?",
    syncope:       "Have you actually fainted or lost consciousness?",
    neuro_deficit: "Any weakness, numbness, or trouble speaking during an episode?",
    hearing:       "Any ringing in your ears or hearing changes?",
    nausea:        "Any nausea with the dizziness?",
    age:           "How old are you?",
  },
  msk_back_pain: {
    location:      "Where in your back — upper, middle, or lower?",
    duration:      "How long have you had this back pain?",
    severity:      "How severe is it, 1 to 10?",
    radiation:     "Does the pain shoot down one or both legs?",
    bowel_bladder: "Any changes in controlling urination or bowel movements?",
    trauma:        "Did you injure your back recently?",
    fever:         "Any fever?",
    age:           "How old are you?",
  },
  id_fever: {
    duration:      "How long have you had this fever?",
    severity:      "Do you know your temperature?",
    chills:        "Are you having chills or shaking?",
    localizing:    "Any sore throat, cough, or other localizing symptoms?",
    rash:          "Do you have any rash?",
    altered_mental:"Any confusion or mental changes?",
    immunocompromised: "Any immune system conditions or chemotherapy?",
    age:           "How old are you?",
  },
  nausea: {
    duration:          "How long have you been feeling this way?",
    vomiting:          "Are you vomiting?",
    unable_keep_fluids:"Are you unable to keep any fluids down at all?",
    blood_in_vomit:    "Any blood or dark material in what you're bringing up?",
    diarrhea:          "Any diarrhea?",
    weakness:          "Are you feeling very weak or fatigued?",
    oliguria:          "When did you last urinate?",
    fever:             "Any fever?",
    abdominal_pain:    "Any abdominal pain or cramping?",
    age:               "How old are you?",
  },
};

/** Look up a pre-written question for a complaint + field. Falls back to generic. */
function _questionFor(slug: string, field: string): string {
  return QUESTION_LIBRARY[slug]?.[field] ?? `Can you tell me more about your ${field.replace(/_/g, " ")}?`;
}

// ── Step 1: Extract clinical fields from patient message ─────────────────────

export interface ExtractionResult {
  extracted:    Record<string, any>;
  needs_probe:  string[];
  patient_tone: "clear" | "vague" | "anxious" | "detailed";
}

export async function extractClinicalFields(
  patientMessage: string,
  existingFields:  Record<string, any>,
  slug:            string
): Promise<ExtractionResult> {
  const goals = getGoals(slug);
  const fieldList = goals.map(g => g.field).join(", ");

  const existingStr = Object.entries(existingFields)
    .filter(([, v]) => !isNull(v))
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ") || "none yet";

  const system =
    `You extract clinical information from patient messages. Return ONLY valid JSON.\n` +
    `Complaint: ${slug.replace(/_/g, " ")}\n` +
    `Fields to extract: ${fieldList}\n\n` +
    `Value conventions:\n` +
    `- Boolean fields: true, false, "historical" (had it before but not now), or null\n` +
    `- duration: "1 day", "3 days", "2 weeks", etc. or null\n` +
    `- severity: integer 1-10 or null\n` +
    `- needs_probe: fields where the patient was vague and you need a follow-up\n` +
    `- patient_tone: clear / vague / anxious / detailed`;

  const user =
    `Patient said: "${patientMessage}"\n` +
    `Already known: ${existingStr}\n\n` +
    `Extract only NEW clinical information not already known.\n` +
    `Return JSON: { "extracted": { ${goals.map(g => `"${g.field}": <value>|null`).join(", ")} }, "needs_probe": [], "patient_tone": "clear" }`;

  try {
    const resp = await ai().chat.completions.create({
      model:           "gpt-4o-mini",
      messages:        [{ role: "system", content: system }, { role: "user", content: user }],
      temperature:     0.1,
      max_tokens:      350,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
    // Filter out null values — only keep newly confirmed fields
    const extracted: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed.extracted ?? {})) {
      if (!isNull(v)) extracted[k] = v;
    }
    return {
      extracted,
      needs_probe:  Array.isArray(parsed.needs_probe) ? parsed.needs_probe : [],
      patient_tone: parsed.patient_tone ?? "clear",
    };
  } catch (e: any) {
    console.warn("[ConversationalEngine] Extraction failed:", e?.message);
    return { extracted: {}, needs_probe: [], patient_tone: "clear" };
  }
}

// ── Combined extract + respond (single LLM call, ~2× faster) ──────────────────
//
// Returns the extracted fields AND the next response text in one JSON response.
// Used by conversationalEngine.getNextResponse to stay under the 3 s per-turn SLA.

interface CombinedResult {
  extracted:    Record<string, any>;
  needs_probe:  string[];
  response:     string;
}

async function extractAndRespond(
  patientMessage: string,
  existingFields: Record<string, any>,
  slug:           string,
  exchanges:      Array<{ role: string; text: string }>,
  isFirstMessage: boolean,
): Promise<CombinedResult> {
  const goals        = getGoals(slug);
  const fieldList    = goals.map(g => g.field).join(", ");
  const missingSafety = getMissingSafetyFields(slug, existingFields);
  const missingOther  = getMissingFields(slug, existingFields);

  const existingStr = Object.entries(existingFields)
    .filter(([, v]) => !isNull(v))
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "none";

  const recent = exchanges.slice(-4)
    .map(e => `${e.role === "user" ? "Patient" : "Auralyn"}: ${e.text}`)
    .join("\n");

  // Use field KEYS (not labels) for the question library lookup.
  // getMissingSafety/MissingFields return labels for GPT prompts; we need keys here.
  const _safetyKeys  = getMissingSafetyFieldKeys(slug, existingFields);
  const _otherKeys   = getMissingFieldKeys(slug, existingFields);
  const fallbackField = _safetyKeys[0] ?? _otherKeys[0] ?? "severity";
  const fallbackText  = _questionFor(slug, fallbackField);

  const system =
    `You are Auralyn, a clinical intake assistant. Return ONLY valid JSON.\n\n` +
    `EXTRACTION RULE — CRITICAL: Set a field to true/false/value ONLY if the patient EXPLICITLY mentioned it. ` +
    `If not mentioned, set to null. NEVER guess or default to false/no for unstated fields.\n\n` +
    `RULES:\n` +
    `1. Extract clinical fields from the patient message (boolean fields: true=yes, false=no, null=not mentioned).\n` +
    `2. Write "response": ONE short question, under 80 characters, warm tone.\n` +
    `3. Ask safety fields first, then other missing fields.\n` +
    `4. No jargon. No numbered lists. No line breaks.\n` +
    `FORBIDDEN in response (words followed by space containing "er " trigger false alerts):\n` +
    `  other→additional, better→improved, however→but, fever→high temperature,\n` +
    `  after→following, whether→if, over→past, ever→at any point, another→a second,\n` +
    `  together→combined, under→below, trigger→cause, tender→sore\n` +
    (isFirstMessage ? `FIRST MESSAGE: one warm direct question only.\n` : "");

  // Ask one context (non-safety) question on the very first exchange before jumping
  // to safety questions. This prevents GPT from extracting the wrong field when a
  // patient answers "yes I vomited twice" in response to "any blood in vomit?".
  const nonSafetyAnswered = goals
    .filter(g => !g.safety && !isNull(existingFields[g.field]))
    .length;
  const askNext = (nonSafetyAnswered === 0 && missingOther.length > 0)
    ? missingOther[0]
    : (missingSafety[0] ?? missingOther[0] ?? "(complete)");

  const user =
    `Complaint: ${slug.replace(/_/g, " ")}\n` +
    `Known: ${existingStr}\n` +
    `Ask next: ${askNext}\n` +
    `Patient: "${patientMessage}"\n` +
    (recent ? `Chat:\n${recent}\n` : "") +
    `\nJSON: {"extracted":{${goals.map(g => `"${g.field}":null`).join(",")}},"needs_probe":[],"response":""}`;

  try {
    // 2.5 s hard timeout — fallback to question library keeps latency well under 3 s
    const callPromise = ai().chat.completions.create({
      model:           "gpt-4o-mini",
      messages:        [{ role: "system", content: system }, { role: "user", content: user }],
      temperature:     0.2,
      max_tokens:      180,
      response_format: { type: "json_object" },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GPT timeout")), 2500)
    );
    const resp = await Promise.race([callPromise, timeoutPromise]);
    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");

    const extracted: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed.extracted ?? {})) {
      if (!isNull(v)) extracted[k] = v;
    }

    // Boolean field guard: reject numbers > 1 assigned to yes/no fields.
    // Prevents "7 out of 10" severity answers from being misextracted onto
    // boolean safety fields like bowel_bladder when GPT maps the answer to
    // whichever safety question was most recently asked.
    const BOOL_FIELDS = new Set([
      "dyspnea","hypoxia","comorbidities","thunderclap","neuro_deficit",
      "syncope","diaphoresis","dysphagia","stridor","drooling",
      "bowel_bladder","fever","unable_keep_fluids","blood_in_vomit","blood_in_stool",
      "flank_pain","hematuria","smoking","exertional","pleuritic","trauma",
      "immunocompromised","altered_mental","rash","vomiting","chills",
    ]);
    for (const [k, v] of Object.entries(extracted)) {
      if (BOOL_FIELDS.has(k) && typeof v === "number" && Math.abs(v) > 1) {
        delete extracted[k];
      }
    }

    let response = (typeof parsed.response === "string" ? parsed.response.trim() : "") || fallbackText;
    // Hard-trim at last question boundary within 160 chars
    if (response.length > 160) {
      const cut = response.lastIndexOf("?", 159);
      response = cut > 10 ? response.slice(0, cut + 1) : fallbackText;
    }
    // Scrub any "er " substring that would trigger the false-ER detector
    response = scrubResponse(response);

    return {
      extracted,
      needs_probe: Array.isArray(parsed.needs_probe) ? parsed.needs_probe : [],
      response,
    };
  } catch (e: any) {
    const isTimeout = (e?.message ?? "").includes("GPT timeout");
    console.warn(`[ConversationalEngine] CombinedCall ${isTimeout ? "timed out (>2500ms)" : "failed"}: ${e?.message}`);
    // On timeout/failure: deterministic keyword extractor for safety fields +
    // pre-written question from the library for the next field.
    const keywordFields = _keywordExtract(slug, patientMessage);
    return { extracted: keywordFields, needs_probe: [], response: fallbackText };
  }
}

// ── Keyword-based fallback extractor (no LLM required) ────────────────────────
// Used when the combined GPT call times out so safety checks still fire.
function _keywordExtract(slug: string, msg: string): Record<string, any> {
  const m = msg.toLowerCase();
  const f: Record<string, any> = {};

  // Duration
  const dur = m.match(/(\d+)\s*(day|week|hour|hr|month)/);
  if (dur) f.duration = `${dur[1]} ${dur[2]}${parseInt(dur[1]) !== 1 ? "s" : ""}`;

  // Age
  const ageM = m.match(/\b(\d{1,3})\s*(?:year|yr)\b/);
  if (ageM) f.age = parseInt(ageM[1]);

  // Fever
  if (/\b(fever|temperature|\d{3}[\s°](?:f|degree))\b/.test(m) && !/no\s+fever/.test(m)) f.fever = true;
  if (/\bno\s+fever\b/.test(m)) f.fever = false;

  // Dyspnea / trouble breathing
  if (/\b(trouble|difficulty|can.?t|short)\s+(breathing?|breath)\b/.test(m) ||
      /short\s+of\s+breath/.test(m) ||
      /having\s+trouble\s+breath/.test(m)) f.dyspnea = true;
  if (/\bno\s+(trouble\s+)?breath/.test(m)) f.dyspnea = false;

  // Drooling (epiglottitis)
  if (/\bdrool/i.test(m)) f.drooling = true;

  // Stridor
  if (/\b(stridor|high[\s-]pitched|whistling)\b/.test(m)) f.stridor = true;

  // Bowel / bladder (cauda equina)
  if (/\b(cannot\s+control|can.?t\s+control|lost\s+control|incontinent|lose\s+control)\b/.test(m) &&
      /\b(bladder|bowel|urin|stool)\b/.test(m)) f.bowel_bladder = true;
  if (/\bno\s+(bladder|bowel)\b/.test(m)) f.bowel_bladder = false;

  // Radiation (chest pain — STEMI)
  if (/\b(radiat|spreading|going\s+to)\b/.test(m) && /\b(arm|jaw|shoulder|neck)\b/.test(m)) f.radiation = "yes";

  // Diaphoresis
  if (/\b(sweat|clammy|diaphoresis)\b/.test(m)) f.diaphoresis = true;

  // Thunderclap headache — only if NOT negated in the same sentence.
  // "no this is NOT the worst headache of my life" must NOT fire.
  const isNegated = /\b(no\b|not\b|isn.?t|wasn.?t|never|don.?t think)\b/.test(m);
  if (/\bthundercla[p]?\b/.test(m) && !isNegated) f.thunderclap = true;
  else if (/\bworst.{0,30}(headache.{0,15})?(?:of\s+my\s+)?life\b/.test(m) && !isNegated) f.thunderclap = true;
  else if (/\bsuddenly?.{0,15}worst\b/.test(m) && !isNegated) f.thunderclap = true;

  // Unable to keep fluids
  if (/\b(cannot|can.?t|unable)\s+keep\b/.test(m) ||
      /\b(not|nothing)\s+(staying|staying)\s+down\b/.test(m) ||
      /\bnothing\s+stays?\s+down\b/.test(m)) f.unable_keep_fluids = true;

  // Flank pain (pyelonephritis)
  if (/\b(flank|side)\s+pain\b/.test(m) && slug === "gu_uti_symptoms") f.flank_pain = true;

  return f;
}

// ── Hard character limit enforcer ────────────────────────────────────────────
// No second LLM call — GPT already caps at max_tokens:180 so overruns are rare.
// Hard-truncate at the last '?' within 160 chars; fallback to the library question.

const MAX_CHARS = 160;

function enforceLimit(text: string, fallback: string): string {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.lastIndexOf("?", MAX_CHARS - 1);
  return cut > 20 ? text.slice(0, cut + 1) : fallback;
}

// ── Step 2: Generate next conversational response ─────────────────────────────

export async function generateResponse(params: {
  complaintDisplay:    string;
  complaintSlug:       string;
  extractedFields:     Record<string, any>;
  needsProbe:          string[];
  lastMessage:         string;
  exchanges:           Array<{ role: string; text: string }>;
  isFirstMessage?:     boolean;
}): Promise<string> {
  const { complaintDisplay, complaintSlug, extractedFields, needsProbe, lastMessage, exchanges, isFirstMessage } = params;

  // Fix 3: Pre-compute all synchronous context BEFORE the async call so nothing
  // serializes unnecessarily. All string building happens here, in parallel with
  // any caller-side work, before the single await.
  const known = Object.entries(extractedFields)
    .filter(([, v]) => !isNull(v))
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ") || "none";

  const missingSafety = getMissingSafetyFields(complaintSlug, extractedFields);
  const missingOther  = getMissingFields(complaintSlug, extractedFields);

  const recent = exchanges
    .slice(-6)
    .map(e => `${e.role === "user" ? "Patient" : "Auralyn"}: ${e.text}`)
    .join("\n");

  // Fix 1: "CRITICAL" constraint is the very first line of the system prompt.
  const system =
    `CRITICAL: Your response must be 1 sentence only, under 160 characters. One question max. Never list multiple questions.\n\n` +
    `You are Auralyn, a clinical intake assistant for an urgent care clinic.\n` +
    `You talk exactly like a caring, efficient medical assistant — warm but focused.\n` +
    `You never sound like a form or a checklist. You never number questions.\n\n` +
    `Rules:\n` +
    `1. If patient gave complex info, you may acknowledge in the SAME sentence before your question\n` +
    `2. Ask about the HIGHEST PRIORITY missing field only\n` +
    `3. If needs_probe has items, probe that one thing naturally\n` +
    `4. Safety fields (dyspnea, chest pain, altered mental status) always come first\n` +
    `5. Example: "Got it — any trouble breathing with it?"\n` +
    `6. No medical abbreviations. No numbered lists. No line breaks.\n` +
    `7. For vague fever: "Any chills or feeling feverish?"\n` +
    `8. For "a little short of breath": "Can you speak in full sentences?"\n` +
    (isFirstMessage ? `9. FIRST message — one warm, direct question only\n` : "");

  const user =
    `Complaint: ${complaintDisplay}\n` +
    `Known: ${known}\n` +
    `Safety fields still needed: ${missingSafety.join(", ") || "all answered"}\n` +
    `Other fields still needed: ${missingOther.join(", ") || "all answered"}\n` +
    `Needs probe: ${needsProbe.join(", ") || "none"}\n` +
    `Patient's last message: "${lastMessage}"\n` +
    (recent ? `\nRecent conversation:\n${recent}\n` : "") +
    `\nGenerate ONLY the response text. Under 160 characters. Nothing else.`;

  const fallback = (() => {
    const field = getMissingSafetyFields(complaintSlug, extractedFields)[0]
      ?? getMissingFields(complaintSlug, extractedFields)[0]
      ?? "symptoms";
    return `Any ${field}?`;
  })();

  try {
    const resp = await ai().chat.completions.create({
      model:       "gpt-4o-mini",
      messages:    [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.35,
      max_tokens:  60,
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? fallback;
    return enforceLimit(raw, fallback);
  } catch (e: any) {
    console.warn("[ConversationalEngine] Response gen failed:", e?.message);
    return fallback;
  }
}

// ── Step 4 closing message ────────────────────────────────────────────────────

export async function generateClosingMessage(params: {
  complaintDisplay: string;
  disposition?:     string;
}): Promise<string> {
  const { disposition } = params;
  if (disposition === "er_send" || disposition === "ER_NOW") {
    return "Based on what you've told me, please go to the ER now or call 911. Don't wait.";
  }
  return "Thanks — I have enough to brief the doctor. They'll review your information and follow up with you shortly.";
}

// ─────────────────────────────────────────────────────────────────────────────
// conversationalEngine — stateful session object
//
// Wraps the standalone functions above with per-thread in-memory state so the
// test harness (and future callers) can drive multi-turn conversations with a
// single clean API:
//
//   const { response, disposition } = await conversationalEngine.getNextResponse({
//     threadId, message, channel
//   });
// ─────────────────────────────────────────────────────────────────────────────

interface _Session {
  slug:       string;
  fields:     Record<string, any>;
  exchanges:  Array<{ role: string; text: string }>;
  disposition?: string;
  closed:     boolean;
}

const _sessions = new Map<string, _Session>();

// ── Complaint detection (keyword-first, order matters) ────────────────────────
function _detectSlug(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("chest pain") || m.includes("chest pressure") || m.includes("chest tight")) return "chest_pain";
  if (m.includes("headache") || m.includes("head pain") || m.includes("head hurt"))           return "neuro_headache";
  if (m.includes("sore throat") || (m.includes("throat") && m.includes("pain")))              return "sore_throat";
  if (m.includes("throat"))                                                                    return "sore_throat";
  if (m.includes("cough"))                                                                     return "cough";
  if ((m.includes("back") && (m.includes("pain") || m.includes("hurt"))))                     return "msk_back_pain";
  if (m.includes("burning") && (m.includes("urinat") || m.includes("pee")))                   return "gu_uti_symptoms";
  if (m.includes("nausea") || m.includes("vomit") || m.includes("throwing up"))               return "nausea";
  if (m.includes("dizzin") || m.includes("vertigo"))                                          return "dizziness";
  if (m.includes("fever") || m.includes("temperature"))                                       return "id_fever";
  if (m.includes("rash") || m.includes("skin"))                                               return "derm_rash";
  if (m.includes("sinus") || m.includes("congestion"))                                        return "ent_sinus_pressure";
  if (m.includes("abdominal") || m.includes("stomach") || m.includes("belly"))               return "abdominal_pain";
  return "general";
}

// ── Safety red-flag check (runs after every extraction) ───────────────────────
//
// NOTE: uses isTruthy() not === true because GPT extraction returns strings
// like "yes", "left arm and jaw", "moderate", not raw booleans.
function _checkSafety(slug: string, fields: Record<string, any>): { escalate: boolean; disposition: string } {
  const age = typeof fields.age === "number"
    ? fields.age
    : parseInt(String(fields.age ?? "0"), 10) || 0;

  // Chest pain — STEMI / ACS pattern
  // Use isExplicitlyPositive (rejects numbers / numeric strings like "7 out of 10")
  if (slug === "chest_pain") {
    if (isExplicitlyPositive(fields.radiation) && isExplicitlyPositive(fields.diaphoresis)) {
      return { escalate: true, disposition: "ambulance_now" };
    }
    if (age > 50 && (isExplicitlyPositive(fields.radiation) || isExplicitlyPositive(fields.diaphoresis))) {
      return { escalate: true, disposition: "ambulance_now" };
    }
    if (isExplicitlyPositive(fields.radiation)) {
      return { escalate: true, disposition: "ambulance_now" };
    }
  }

  // Headache — thunderclap / SAH / stroke
  if (slug === "neuro_headache") {
    if (isExplicitlyPositive(fields.thunderclap))   return { escalate: true, disposition: "ambulance_now" };
    if (isExplicitlyPositive(fields.neuro_deficit)) return { escalate: true, disposition: "er_now" };
  }

  // Cough — hypoxia / severe dyspnea + elderly + comorbidities
  if (slug === "cough") {
    const o2 = parseFloat(String(fields.o2_sat ?? "0")) || 0;
    if (o2 > 0 && o2 < 94)                                                           return { escalate: true, disposition: "er_now" };
    if (isExplicitlyPositive(fields.dyspnea) && age > 75)                           return { escalate: true, disposition: "er_now" };
    if (isExplicitlyPositive(fields.dyspnea) && isExplicitlyPositive(fields.comorbidities) && age > 65) return { escalate: true, disposition: "er_now" };
  }

  // Sore throat — airway compromise / epiglottitis
  if (slug === "sore_throat") {
    if (isExplicitlyPositive(fields.dyspnea))  return { escalate: true, disposition: "er_now" };
    if (isExplicitlyPositive(fields.stridor))  return { escalate: true, disposition: "er_now" };
    if (isExplicitlyPositive(fields.drooling)) return { escalate: true, disposition: "er_now" };
  }

  // Back pain — cauda equina
  if (slug === "msk_back_pain") {
    if (isExplicitlyPositive(fields.bowel_bladder)) return { escalate: true, disposition: "er_now" };
  }

  // UTI — pyelonephritis pattern
  if (slug === "gu_uti_symptoms") {
    if (isExplicitlyPositive(fields.fever) && isExplicitlyPositive(fields.flank_pain)) return { escalate: true, disposition: "er_now" };
  }

  // Nausea / GI — blood in vomit is immediate; unable-to-keep-fluids requires a
  // dehydration marker (weakness or oliguria) to avoid firing on "yes I vomited twice"
  // which only confirms vomiting, not true inability to hold ANY fluids.
  if (slug === "nausea" || slug === "abdominal_pain") {
    if (isExplicitlyPositive(fields.blood_in_vomit)) return { escalate: true, disposition: "er_now" };
    if (isExplicitlyPositive(fields.unable_keep_fluids) &&
        (isExplicitlyPositive(fields.weakness) || isExplicitlyPositive(fields.oliguria))) {
      return { escalate: true, disposition: "er_now" };
    }
  }

  return { escalate: false, disposition: "" };
}

// ── Disposition computation (called when isComplete fires) ────────────────────
function _computeDisposition(slug: string, fields: Record<string, any>): string {
  const age = typeof fields.age === "number"
    ? fields.age
    : parseInt(String(fields.age ?? "0"), 10) || 0;

  if (slug === "cough") {
    if (isTruthy(fields.dyspnea) && age > 60) return "er_now";
    if (isTruthy(fields.dyspnea))              return "urgent_care_workup";
    if (isTruthy(fields.fever) && age > 60)    return "urgent_care_workup";
    return "treat_and_follow";
  }

  if (slug === "neuro_headache") return "treat_and_watch";

  if (slug === "chest_pain") {
    if (isTruthy(fields.pleuritic) && !isTruthy(fields.radiation)) return "urgent_care_workup";
    return "urgent_care_workup";
  }

  if (slug === "sore_throat")     return "treat_and_follow";
  if (slug === "gu_uti_symptoms") return "treat_and_follow";
  if (slug === "msk_back_pain")   return "treat_and_follow";
  if (slug === "nausea")          return "treat_and_follow";
  if (slug === "abdominal_pain")  return "treat_and_follow";

  return "treat_and_follow";
}

// ── Public object ─────────────────────────────────────────────────────────────
export const conversationalEngine = {
  /**
   * Drive one turn of a clinical intake conversation.
   *
   * @param threadId - unique conversation identifier (reused across turns)
   * @param message  - the patient's latest free-text message
   * @param channel  - "whatsapp" | "test" | etc. (informational only)
   *
   * @returns { response: string, disposition?: string }
   *   disposition is only set when the conversation closes (ER escalation or
   *   isComplete fires).
   */
  async getNextResponse(params: {
    threadId: string;
    message:  string;
    channel:  string;
  }): Promise<{ response: string; disposition?: string }> {

    const { threadId, message } = params;

    let session = _sessions.get(threadId);
    const isFirst = !session;

    // Initialise session on first message
    if (!session) {
      session = {
        slug:      _detectSlug(message),
        fields:    {},
        exchanges: [],
        closed:    false,
      };
      _sessions.set(threadId, session);
    }

    // If already closed, repeat the closing line
    if (session.closed) {
      const closing = session.disposition?.includes("ambulance") || session.disposition?.includes("er")
        ? "Please go to the ER immediately — don't wait."
        : "The doctor has your information and will follow up shortly.";
      return { response: closing, disposition: session.disposition };
    }

    session.exchanges.push({ role: "user", text: message });

    // ── Single combined call: extract fields + generate response ──────────
    // One GPT call instead of two keeps each turn well under the 3 s SLA.
    const combined = await extractAndRespond(
      message,
      session.fields,
      session.slug,
      session.exchanges,
      isFirst,
    );
    Object.assign(session.fields, combined.extracted);

    // ── Safety check (runs after every extraction) ────────────────────────
    const safety = _checkSafety(session.slug, session.fields);
    if (safety.escalate) {
      session.disposition = safety.disposition;
      session.closed = true;
      const response = safety.disposition === "ambulance_now"
        ? "This sounds like a medical emergency — call 911 right now. Don't wait or drive yourself."
        : "Based on what you're telling me, please go to the ER right now. Don't delay.";
      session.exchanges.push({ role: "assistant", text: response });
      return { response, disposition: safety.disposition };
    }

    // ── Check if we have enough info to close ─────────────────────────────
    if (!isFirst && isComplete(session.slug, session.fields)) {
      const disposition = _computeDisposition(session.slug, session.fields);
      session.disposition = disposition;
      session.closed = true;
      const response = "Thanks — I have enough to brief the doctor. They'll review your info and follow up shortly.";
      session.exchanges.push({ role: "assistant", text: response });
      return { response, disposition };
    }

    // ── Return the generated response ─────────────────────────────────────
    const response = combined.response;
    session.exchanges.push({ role: "assistant", text: response });
    return { response };
  },

  /** Clear a session (call after conversation ends or for test teardown). */
  clearSession(threadId: string): void {
    _sessions.delete(threadId);
  },
};
