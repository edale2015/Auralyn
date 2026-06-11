/**
 * narrativeIntakeEngine.ts
 *
 * "Listen first, clarify second."
 *
 * Converts a patient's free-text narrative — "I've had crushing chest pressure
 * for 2 hours that goes down my left arm and I'm soaking wet" — into structured
 * pipeline inputs WITHOUT firing a single explicit yes/no question first.
 *
 * Pipeline:
 *   Pass 1 — GPT-4o-mini extracts clinical entities + detects chief complaint
 *   Pass 2 — GPT-4o-mini maps every extracted entity against the complaint's
 *             question rules and marks each question answered / unanswered
 *   Pass 3 — Only questions the narrative did NOT answer are surfaced for
 *             follow-up; the rest feed directly into the rule execution engine
 *
 * Why this improves the pipeline:
 *   • Mirrors how real physicians take history (open-ended first)
 *   • Reduces patient fatigue (no redundant questions)
 *   • Captures narrative nuance binary yes/no questions miss
 *   • Detects co-complaints automatically
 *   • Pre-fills up to 60-80% of structured fields from a single paragraph
 */

import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { classifyComplaint } from "../test/patientResponseSimulator";

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClinicalEntities {
  duration:           string | null;       // "2 hours", "3 days"
  onset:              "sudden" | "gradual" | "unknown" | null;
  severity:           number | null;       // 1-10 pain scale
  location:           string | null;       // "left chest", "lower abdomen"
  quality:            string | null;       // "crushing", "sharp", "burning"
  radiation:          string | null;       // "left arm", "jaw", "back"
  aggravating:        string[];            // ["exertion", "deep breath"]
  relieving:          string[];            // ["rest", "antacids"]
  associated:         string[];            // ["diaphoresis", "nausea", "SOB"]
  pertinentNegatives: string[];            // explicitly denied: ["no fever"]
  timing:             "constant" | "intermittent" | "episodic" | null;
  context:            string | null;       // "watching TV", "after eating"
  coComplaints:       string[];            // secondary complaints detected
}

export interface QuestionMatch {
  ruleId:          string;
  questionText:    string;
  level:           1 | 2 | 3;
  safety_level:    string;
  answeredBy:      "narrative" | "unanswered";
  extractedAnswer: "yes" | "no" | "value" | null;
  extractedValue:  string | null;   // the actual text extracted
  confidence:      number;          // 0-1
  deps:            string[];        // question_dependencies field keys
}

export interface SuggestedComplaint {
  id:           string;
  label:        string;
  confidence:   number;
  system:       string;
}

export interface NarrativeExtraction {
  rawNarrative:         string;
  detectedComplaint:    string;
  complaintConfidence:  number;
  suggestedComplaints:  SuggestedComplaint[];
  entities:             ClinicalEntities;
  questionMatches:      QuestionMatch[];
  answeredCount:        number;
  unansweredCount:      number;
  prefilledPercent:     number;
  pipelineInputs:       Record<string, boolean | string | number>;
  remainingQuestions:   QuestionMatch[];   // only the unanswered ones
  durationMs:           number;
  passOneDurationMs:    number;
  passTwoDurationMs:    number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseDeps(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as string[]).map(String).filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    return s.slice(1, -1).split(",").map(f => f.trim()).filter(Boolean);
  }
  return s ? s.split(/[\s,]+/).map(f => f.trim()).filter(Boolean) : [];
}

function priorityToLevel(p: number | null): 1 | 2 | 3 {
  if (!p || p <= 2)  return 1;
  if (p <= 10)       return 2;
  return 3;
}

// ── Pass 1: Entity extraction + complaint detection ───────────────────────────

interface Pass1Result {
  detectedComplaint:   string;
  confidence:          number;
  alternatives:        Array<{ complaint: string; confidence: number }>;
  entities:            ClinicalEntities;
}

async function runPass1(narrative: string): Promise<Pass1Result> {
  const prompt = `You are a clinical NLP system. A patient just walked in and said:

"${narrative}"

Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "detectedComplaint": "<one of: chest_pain, sore_throat, abdominal_pain, headache, cough, dizziness, derm_rash, gu_uti_symptoms, msk_back_pain, id_fever, shortness_of_breath, ear_pain, sinus_pressure, nausea_vomiting, palpitations, or a specific variant if obvious>",
  "confidence": <0.0-1.0>,
  "alternatives": [
    {"complaint": "<id>", "confidence": <0.0-1.0>}
  ],
  "entities": {
    "duration": "<string or null>",
    "onset": "<sudden|gradual|unknown|null>",
    "severity": <1-10 or null>,
    "location": "<string or null>",
    "quality": "<string or null>",
    "radiation": "<string or null>",
    "aggravating": ["<factor>"],
    "relieving": ["<factor>"],
    "associated": ["<symptom>"],
    "pertinentNegatives": ["<explicitly denied symptom>"],
    "timing": "<constant|intermittent|episodic|null>",
    "context": "<string or null>",
    "coComplaints": ["<secondary complaint>"]
  }
}

Rules:
- detectedComplaint must be a valid medical chief complaint ID (snake_case)
- Use null for unknown/unmentioned fields
- severity: estimate from language ("a bit" = 3, "moderate" = 5, "terrible/crushing" = 8-9)
- pertinentNegatives: only things the patient EXPLICITLY denied
- coComplaints: secondary concerns mentioned alongside the main complaint
- confidence: how certain you are this is the chief complaint (not overall certainty)`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    detectedComplaint: parsed.detectedComplaint ?? "unknown",
    confidence:        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    alternatives:      Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    entities:          {
      duration:           parsed.entities?.duration           ?? null,
      onset:              parsed.entities?.onset              ?? null,
      severity:           parsed.entities?.severity           ?? null,
      location:           parsed.entities?.location           ?? null,
      quality:            parsed.entities?.quality            ?? null,
      radiation:          parsed.entities?.radiation          ?? null,
      aggravating:        parsed.entities?.aggravating        ?? [],
      relieving:          parsed.entities?.relieving          ?? [],
      associated:         parsed.entities?.associated         ?? [],
      pertinentNegatives: parsed.entities?.pertinentNegatives ?? [],
      timing:             parsed.entities?.timing             ?? null,
      context:            parsed.entities?.context            ?? null,
      coComplaints:       parsed.entities?.coComplaints       ?? [],
    },
  };
}

// ── Resolve detected complaint to a real complaint_id in the DB ───────────────

async function resolveComplaintId(
  detected: string,
  hintId?: string,
): Promise<{ id: string; label: string }> {
  if (hintId) return { id: hintId, label: hintId };

  // Exact match first
  const { rows: exact } = await db.execute(sql`
    SELECT DISTINCT complaint_id FROM kb_master_rules
    WHERE complaint_id = ${detected} LIMIT 1
  `);
  if (exact.length > 0) return { id: detected, label: detected };

  // Fuzzy ILIKE match
  const { rows: fuzzy } = await db.execute(sql`
    SELECT DISTINCT complaint_id,
           COUNT(*) as cnt
    FROM kb_master_rules
    WHERE complaint_id ILIKE ${'%' + detected.replace(/_/g, '%') + '%'}
       OR complaint_id ILIKE ${'%' + detected.split('_')[0] + '%'}
    GROUP BY complaint_id
    ORDER BY cnt DESC
    LIMIT 5
  `);

  if (fuzzy.length > 0) {
    const best = (fuzzy[0] as any).complaint_id as string;
    return { id: best, label: best };
  }

  // Fall back to closest common complaint
  const fallback = detected.replace(/[_\s]+/g, "_").toLowerCase();
  return { id: fallback, label: fallback };
}

// ── Load question rules from DB ───────────────────────────────────────────────

interface DBQuestion {
  rule_id:               string;
  rule_name:             string;
  logic_description:     string | null;
  question_dependencies: string | string[] | null;
  safety_level:          string;
  priority:              number | null;
}

async function loadQuestionsForComplaint(complaintId: string): Promise<DBQuestion[]> {
  const { rows } = await db.execute(sql`
    SELECT rule_id, rule_name, logic_description, question_dependencies,
           safety_level, priority
    FROM kb_master_rules
    WHERE complaint_id = ${complaintId}
      AND rule_type = 'question'
      AND active = true
    ORDER BY priority ASC NULLS LAST
    LIMIT 60
  `);
  return rows as DBQuestion[];
}

// ── Pass 2: Deterministic entity-based question matching ─────────────────────
//
// Since Pass 1 already extracted all clinical entities, Pass 2 is purely
// deterministic — no extra LLM call, no JSON parsing, instantaneous.
// Each question's text is matched against entity patterns extracted in Pass 1.
// This reduces total latency from ~17s to ~2s while improving reliability.

type MatchResult = { answer: "yes" | "no" | "value"; value: string | null; confidence: number };

function matchQuestionToEntities(
  questionText: string,
  entities: ClinicalEntities,
): MatchResult | null {
  const t = questionText.toLowerCase();
  const assoc = entities.associated.map(s => s.toLowerCase());
  const neg   = entities.pertinentNegatives.map(s => s.toLowerCase());

  // ── Duration / timing ────────────────────────────────────────────────────
  if (/how long|duration|when did|how long ago|how many (days|hours|weeks)|since when|started/.test(t) && entities.duration) {
    return { answer: "value", value: entities.duration, confidence: 0.9 };
  }

  // ── Onset character ───────────────────────────────────────────────────────
  if (/sudden|abrupt|come on (suddenly|quickly)|onset|gradual|slowly developed/.test(t) && entities.onset) {
    const val = entities.onset;
    const isYesSudden = /sudden/.test(t) && val === "sudden";
    const isYesGradual = /gradual/.test(t) && val === "gradual";
    return { answer: (isYesSudden || isYesGradual) ? "yes" : "value", value: val, confidence: 0.82 };
  }

  // ── Severity scale ────────────────────────────────────────────────────────
  if (/scale.*\d|pain.*\d.*\d|rate.*pain|severe.*pain|how (bad|severe|intense)|0.*10|1.*10/.test(t) && entities.severity) {
    return { answer: "value", value: `${entities.severity}/10`, confidence: 0.88 };
  }

  // ── Quality / character ───────────────────────────────────────────────────
  if (/sharp|dull|pressure|burning|stabbing|crushing|squeezing|aching|cramping|tearing|character|feel like|quality|nature of/.test(t) && entities.quality) {
    return { answer: "value", value: entities.quality, confidence: 0.82 };
  }

  // ── Radiation ─────────────────────────────────────────────────────────────
  if (/radiat|spread|travel|go.*arm|go.*jaw|go.*neck|go.*shoulder|go.*back|referred/.test(t) && entities.radiation) {
    return { answer: "yes", value: entities.radiation, confidence: 0.92 };
  }

  // ── Location ──────────────────────────────────────────────────────────────
  if (/where.*pain|location|point to|area|which side|where.*hurt/.test(t) && entities.location) {
    return { answer: "value", value: entities.location, confidence: 0.82 };
  }

  // ── Timing pattern ────────────────────────────────────────────────────────
  if (/constant|intermittent|comes and goes|episodic|continuous|persistent|all the time|on and off/.test(t) && entities.timing) {
    return { answer: "value", value: entities.timing, confidence: 0.78 };
  }

  // ── Aggravating factors ───────────────────────────────────────────────────
  if (/worse|aggravat|exertion|physical activity|walking|climbing|deep breath|eating|movement|trigger|bring.*on|makes.*worse/.test(t) && entities.aggravating.length > 0) {
    return { answer: "yes", value: entities.aggravating.join(", "), confidence: 0.82 };
  }

  // ── Relieving factors ─────────────────────────────────────────────────────
  if (/better|relief|improve|antacid|nitroglycerin|rest|sitting|lying|position|make.*better|help/.test(t) && entities.relieving.length > 0) {
    return { answer: "yes", value: entities.relieving.join(", "), confidence: 0.82 };
  }

  // ── Context / activity at onset ───────────────────────────────────────────
  if (/doing.*when|activity.*when|were.*doing|at rest|while.*doing|what.*were.*you/.test(t) && entities.context) {
    return { answer: "value", value: entities.context, confidence: 0.75 };
  }

  // ── Associated symptoms — pattern map ────────────────────────────────────
  const ASSOC_PATTERNS: Array<{ match: RegExp; check: RegExp; label: string }> = [
    { match: /sweat|diaphor|clammy|perspir/,                       check: /sweat|diaphor|perspir/,          label: "sweating" },
    { match: /nausea|vomit|sick.*stomach|queasy|emesis/,           check: /nausea|vomit|queasy|sick/,       label: "nausea" },
    { match: /shortness.*breath|dyspnea|breathing|sob|breath/,    check: /breath|dyspnea|sob/,             label: "shortness of breath" },
    { match: /dizz|lightheaded|faint|syncope|pass.*out|vertigo/,  check: /dizz|lightheaded|faint|syncope/, label: "dizziness" },
    { match: /fever|temperature|hot|feverish|chills/,              check: /fever|temperature|chills/,       label: "fever" },
    { match: /palpitat|heart.*flutter|racing.*heart|irregular.*heart|skipping/, check: /palpitat|flutter|racing|irregular/, label: "palpitations" },
    { match: /chest.*pain|chest.*pressure|chest.*tight|chest.*discomfort/,      check: /chest/,             label: "chest pain" },
    { match: /cough|productive|phlegm|mucus|sputum/,               check: /cough|phlegm|mucus/,             label: "cough" },
    { match: /headache|head.*pain|head.*ache|migraine/,            check: /headache|head.*ache|migraine/,   label: "headache" },
    { match: /back.*pain|lower.*back|spine/,                       check: /back.*pain|lower.*back/,         label: "back pain" },
    { match: /rash|skin.*lesion|spot|itch|hives/,                  check: /rash|lesion|itch|hives/,         label: "rash" },
    { match: /fatigue|tired|weak|exhausted|lethargy/,              check: /fatigue|tired|weak/,             label: "fatigue" },
    { match: /abdominal|stomach.*pain|belly|epigastric/,           check: /abdomen|stomach|belly/,          label: "abdominal pain" },
    { match: /leg.*swell|ankle.*swell|edema|pitting/,              check: /swell|edema/,                    label: "leg swelling" },
    { match: /arm.*pain|shoulder.*pain/,                           check: /arm.*pain|shoulder/,             label: "arm pain" },
  ];

  for (const pat of ASSOC_PATTERNS) {
    if (pat.match.test(t)) {
      const hasIt     = assoc.some(s => pat.check.test(s));
      const deniedIt  = neg.some(s => pat.check.test(s));
      if (hasIt)    return { answer: "yes", value: `${pat.label} mentioned`,       confidence: 0.88 };
      if (deniedIt) return { answer: "no",  value: "patient explicitly denied this", confidence: 0.90 };
    }
  }

  // ── Medical history / PMH ─────────────────────────────────────────────────
  if (/history|prior|past.*medical|before|previous|ever had|been diagnosed/.test(t) && entities.context) {
    const contextLower = entities.context.toLowerCase();
    if (/history|diagnosis|condition|prior/.test(contextLower)) {
      return { answer: "yes", value: entities.context, confidence: 0.72 };
    }
  }

  return null;
}

function runPass2(
  _narrative: string,
  entities:   ClinicalEntities,
  questions:  DBQuestion[],
): QuestionMatch[] {
  if (questions.length === 0) return [];

  return questions.map(q => {
    const text  = q.logic_description ?? q.rule_name ?? "";
    const deps  = parseDeps(q.question_dependencies);
    const match = matchQuestionToEntities(text, entities);

    return {
      ruleId:          q.rule_id,
      questionText:    text,
      level:           priorityToLevel(q.priority != null ? Number(q.priority) : null),
      safety_level:    q.safety_level ?? "STANDARD",
      answeredBy:      match !== null ? "narrative" as const : "unanswered" as const,
      extractedAnswer: match?.answer ?? null,
      extractedValue:  match?.value ?? null,
      confidence:      match?.confidence ?? 0,
      deps,
    };
  });
}

// ── Build pipeline inputs from matched questions ──────────────────────────────

function buildInputsFromMatches(matches: QuestionMatch[]): Record<string, boolean | string | number> {
  const inputs: Record<string, boolean | string | number> = {};
  for (const m of matches) {
    if (m.answeredBy !== "narrative" || m.extractedAnswer === null) continue;
    for (const dep of m.deps) {
      if (m.extractedAnswer === "yes")        inputs[dep] = true;
      else if (m.extractedAnswer === "no")    inputs[dep] = false;
      else if (m.extractedValue)              inputs[dep] = m.extractedValue;
      else                                    inputs[dep] = true;
    }
  }
  return inputs;
}

// ── Build suggested complaint list ────────────────────────────────────────────

function buildSuggestions(
  primary: { id: string; confidence: number },
  alternatives: Array<{ complaint: string; confidence: number }>,
): SuggestedComplaint[] {
  const all = [
    { id: primary.id, confidence: primary.confidence },
    ...alternatives.map(a => ({ id: a.complaint, confidence: a.confidence })),
  ];
  return all
    .slice(0, 4)
    .map(s => ({
      id:         s.id,
      label:      s.id.replace(/_/g, " "),
      confidence: s.confidence,
      system:     classifyComplaint(s.id),
    }));
}

// ── Main exported function ────────────────────────────────────────────────────

export async function runNarrativeIntake(
  narrative:        string,
  hintComplaintId?: string,
): Promise<NarrativeExtraction> {
  const totalStart = Date.now();
  if (!narrative?.trim()) {
    throw new Error("narrative is required");
  }

  // ── Pass 1: entity + complaint detection ──────────────────────────────────
  const pass1Start = Date.now();
  const pass1 = await runPass1(narrative);
  const pass1Ms = Date.now() - pass1Start;

  // Resolve to a real complaint ID
  const resolved = await resolveComplaintId(pass1.detectedComplaint, hintComplaintId);
  const questions = await loadQuestionsForComplaint(resolved.id);

  // ── Pass 2: deterministic entity-based matching (synchronous, ~0ms) ────────
  const pass2Start = Date.now();
  const matches = questions.length > 0
    ? runPass2(narrative, pass1.entities, questions)
    : [];
  const pass2Ms = Date.now() - pass2Start;

  const answered   = matches.filter(m => m.answeredBy === "narrative");
  const unanswered = matches.filter(m => m.answeredBy === "unanswered");
  const total      = matches.length;
  const pipelineInputs = buildInputsFromMatches(matches);

  return {
    rawNarrative:        narrative,
    detectedComplaint:   resolved.id,
    complaintConfidence: hintComplaintId ? 1.0 : pass1.confidence,
    suggestedComplaints: buildSuggestions(
      { id: pass1.detectedComplaint, confidence: pass1.confidence },
      pass1.alternatives,
    ),
    entities:            pass1.entities,
    questionMatches:     matches,
    answeredCount:       answered.length,
    unansweredCount:     unanswered.length,
    prefilledPercent:    total > 0 ? Math.round((answered.length / total) * 100) : 0,
    pipelineInputs,
    remainingQuestions:  unanswered,
    durationMs:          Date.now() - totalStart,
    passOneDurationMs:   pass1Ms,
    passTwoDurationMs:   pass2Ms,
  };
}

// ── Generate an open-ended intake prompt for display ─────────────────────────

export const INTAKE_PROMPTS = [
  "What's going on today?",
  "How can I help you?",
  "Tell me what brought you in.",
  "What's been bothering you?",
  "What's on your mind?",
];

export function getIntakePrompt(index = 0): string {
  return INTAKE_PROMPTS[index % INTAKE_PROMPTS.length];
}
