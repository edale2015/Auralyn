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

let _client: OpenAI | null = null;
function ai(): OpenAI {
  if (!_client) _client = new OpenAI();
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
    { field: "dysphagia",      priority: 1, safety: true,  label: "trouble swallowing saliva" },
    { field: "dyspnea",        priority: 1, safety: true,  label: "trouble breathing" },
    { field: "stridor",        priority: 1, safety: true,  label: "high-pitched breathing sounds" },
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
    { field: "bowel_bladder",  priority: 1, safety: true,  label: "bowel or bladder changes" },
    { field: "trauma",         priority: 2, safety: false, label: "recent injury" },
    { field: "fever",          priority: 1, safety: true,  label: "fever" },
    { field: "age",            priority: 1, safety: false, label: "age" },
  ],
  id_fever: [
    { field: "duration",       priority: 1, safety: false, label: "how long" },
    { field: "severity",       priority: 1, safety: false, label: "temperature if known" },
    { field: "chills",         priority: 1, safety: false, label: "chills or rigors" },
    { field: "localizing",     priority: 1, safety: false, label: "sore throat, cough, or other localizing symptoms" },
    { field: "rash",           priority: 2, safety: true,  label: "rash" },
    { field: "altered_mental", priority: 1, safety: true,  label: "confusion or altered mental status" },
    { field: "immunocompromised", priority: 2, safety: true, label: "immune status" },
    { field: "age",            priority: 1, safety: false, label: "age" },
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

export function getMissingSafetyFields(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => g.safety && isNull(fields[g.field]))
    .map(g => g.label);
}

export function getMissingFields(slug: string, fields: Record<string, any>): string[] {
  return getGoals(slug)
    .filter(g => !g.safety && isNull(fields[g.field]))
    .map(g => g.label);
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

  const system =
    `You are Auralyn, a clinical intake assistant for an urgent care clinic.\n` +
    `You talk exactly like a caring, efficient medical assistant — warm but focused.\n` +
    `You never sound like a form or a checklist. You never number questions.\n\n` +
    `Rules:\n` +
    `1. If patient gave complex info, ACKNOWLEDGE it first in ≤1 sentence\n` +
    `2. Ask about the HIGHEST PRIORITY missing field next\n` +
    `3. If needs_probe has items, probe naturally before moving on\n` +
    `4. Never ask more than 2 things in one message\n` +
    `5. Safety fields (dyspnea, chest pain, altered mental status) always come first\n` +
    `6. Example tone: "Got it — so the cough just started yesterday. Any trouble breathing?"\n` +
    `7. No medical abbreviations. No numbered lists.\n` +
    `8. For vague fever: "Did you feel feverish or have chills, even without checking your temperature?"\n` +
    `9. For "a little short of breath": "Are you able to speak in full sentences, or does it feel harder?"\n` +
    `10. Maximum 2 sentences total\n` +
    (isFirstMessage ? `11. FIRST message — ask the single most important question warmly\n` : "");

  const user =
    `Complaint: ${complaintDisplay}\n` +
    `Known: ${known}\n` +
    `Safety fields still needed: ${missingSafety.join(", ") || "all answered"}\n` +
    `Other fields still needed: ${missingOther.join(", ") || "all answered"}\n` +
    `Needs probe: ${needsProbe.join(", ") || "none"}\n` +
    `Patient's last message: "${lastMessage}"\n` +
    (recent ? `\nRecent conversation:\n${recent}\n` : "") +
    `\nGenerate ONLY the response text. Nothing else.`;

  try {
    const resp = await ai().chat.completions.create({
      model:       "gpt-4o-mini",
      messages:    [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.35,
      max_tokens:  120,
    });
    return resp.choices[0]?.message?.content?.trim() ??
      `Can you tell me a bit more about your ${complaintDisplay.toLowerCase()}?`;
  } catch (e: any) {
    console.warn("[ConversationalEngine] Response gen failed:", e?.message);
    const missing = getMissingSafetyFields(complaintSlug, extractedFields)[0]
      ?? getMissingFields(complaintSlug, extractedFields)[0]
      ?? "symptoms";
    return `Can you tell me about ${missing}?`;
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
