/**
 * Clinical Reasoner — differential diagnosis, red flags, next steps
 * Uses OpenAI when available, falls back to deterministic rule engine.
 * Outputs structured reasoning that feeds into the Disposition Engine.
 */

import type { ScoredChunk } from "./relevanceScorer";

let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const OpenAI = require("openai").default ?? require("openai");
    _openai = new OpenAI({
      apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

export interface ClinicalReasoningOutput {
  differentialDiagnosis: Array<{ diagnosis: string; likelihood: "high" | "moderate" | "low"; reason: string }>;
  redFlags:              string[];
  nextSteps:             string[];
  urgency:               "immediate" | "urgent" | "routine";
  summary:               string;
  source:                "llm" | "deterministic";
}

const FALLBACK_PATTERNS: Array<{
  keywords: string[];
  ddx: ClinicalReasoningOutput["differentialDiagnosis"];
  redFlags: string[];
  nextSteps: string[];
  urgency: ClinicalReasoningOutput["urgency"];
}> = [
  {
    keywords: ["chest pain"],
    ddx: [
      { diagnosis: "Acute Coronary Syndrome",     likelihood: "high",     reason: "Classic chest pain presentation" },
      { diagnosis: "Pulmonary Embolism",           likelihood: "moderate", reason: "Must exclude in chest pain with dyspnea" },
      { diagnosis: "Aortic Dissection",            likelihood: "low",      reason: "Tearing pain to back warrants consideration" },
    ],
    redFlags:  ["Radiating pain to jaw/arm", "Diaphoresis", "ST elevation on ECG", "Hemodynamic instability"],
    nextSteps: ["12-lead ECG within 10 minutes", "Troponin x2 at 0+3h", "Aspirin 325mg PO", "Cardiology consult"],
    urgency:   "immediate",
  },
  {
    keywords: ["fever", "sepsis"],
    ddx: [
      { diagnosis: "Bacterial Sepsis",     likelihood: "high",     reason: "Fever with systemic signs" },
      { diagnosis: "Viral Syndrome",       likelihood: "moderate", reason: "Common cause of febrile illness" },
      { diagnosis: "Meningitis",           likelihood: "low",      reason: "Must exclude with neck stiffness/altered MS" },
    ],
    redFlags:  ["Altered mental status", "Hypotension SBP < 90", "Lactate > 2 mmol/L", "Rigid neck"],
    nextSteps: ["Blood cultures x2", "Serum lactate", "CBC + BMP + LFTs", "Broad-spectrum antibiotics if sepsis"],
    urgency:   "urgent",
  },
  {
    keywords: ["headache"],
    ddx: [
      { diagnosis: "Tension Headache",     likelihood: "high",     reason: "Most common headache type" },
      { diagnosis: "Migraine",             likelihood: "moderate", reason: "Common, especially with photophobia/nausea" },
      { diagnosis: "Subarachnoid Hemorrhage", likelihood: "low",  reason: "Thunderclap onset warrants urgent CT" },
    ],
    redFlags:  ["Worst headache of life", "Thunderclap onset", "Fever + neck stiffness", "Focal neurological signs"],
    nextSteps: ["Neuro exam", "CT head if red flags", "LP if CT negative but SAH suspected"],
    urgency:   "urgent",
  },
];

function deterministicReason(query: string, context: ScoredChunk[]): ClinicalReasoningOutput {
  const lower     = query.toLowerCase();
  const match     = FALLBACK_PATTERNS.find((p) => p.keywords.some((k) => lower.includes(k)));

  const contextText = context.map((c) => c.text.slice(0, 200)).join("\n");

  if (match) {
    return {
      differentialDiagnosis: match.ddx,
      redFlags:              match.redFlags,
      nextSteps:             match.nextSteps,
      urgency:               match.urgency,
      summary:               contextText.slice(0, 300) || `Clinical assessment for: ${query}`,
      source:                "deterministic",
    };
  }

  return {
    differentialDiagnosis: [
      { diagnosis: "Condition under evaluation", likelihood: "moderate", reason: "Requires full clinical assessment" },
    ],
    redFlags:  ["Vital sign instability", "Altered mental status", "Rapid symptom progression"],
    nextSteps: ["Complete history and physical", "Appropriate labs and imaging per clinical judgment", "Physician review"],
    urgency:   "routine",
    summary:   contextText.slice(0, 300) || `Evaluation for: ${query}`,
    source:    "deterministic",
  };
}

export async function clinicalReason(
  query:   string,
  context: ScoredChunk[]
): Promise<ClinicalReasoningOutput> {
  const contextText = context.map((c, i) => `[${i + 1}] ${c.text.slice(0, 300)}`).join("\n");

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!openaiKey) {
    return deterministicReason(query, context);
  }

  try {
    const ai       = getOpenAI();
    const prompt   = `You are a clinical reasoning engine for an emergency medicine triage platform.

Context from clinical knowledge bases:
${contextText || "(no context retrieved)"}

Clinical query: ${query}

Respond in valid JSON with EXACTLY this structure:
{
  "differentialDiagnosis": [
    { "diagnosis": "...", "likelihood": "high|moderate|low", "reason": "..." }
  ],
  "redFlags": ["..."],
  "nextSteps": ["..."],
  "urgency": "immediate|urgent|routine",
  "summary": "..."
}

Rules:
- List top 3 differential diagnoses ordered by likelihood
- Include 3-5 red flags to watch for
- Include 3-6 concrete next steps (labs, imaging, interventions)
- Urgency: immediate=minutes, urgent=hours, routine=days
- Be concise and evidence-based`;

    const response = await ai.chat.completions.create({
      model:       "gpt-4o-mini",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens:  600,
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(response.choices[0].message.content ?? "{}");

    return {
      differentialDiagnosis: raw.differentialDiagnosis ?? [],
      redFlags:              raw.redFlags ?? [],
      nextSteps:             raw.nextSteps ?? [],
      urgency:               raw.urgency ?? "routine",
      summary:               raw.summary ?? "",
      source:                "llm",
    };
  } catch (err) {
    console.warn("[ClinicalReasoner] LLM unavailable, using deterministic fallback:", (err as Error).message);
    return deterministicReason(query, context);
  }
}
