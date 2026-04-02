import { openai } from "../../replit_integrations/audio/client";
import { applyPHIGuard } from "../../middleware/phiGuardOpenAI";

export interface ReasoningResult {
  hypothesis: string;
  confidence: number;
  evidenceSupporting: string[];
  evidenceAgainst: string[];
  nextSteps: string[];
}

const SYSTEM_PROMPT = `You are an expert emergency medicine physician and clinical reasoning engine.
Given a list of symptoms and patient history, generate a primary diagnostic hypothesis with a confidence score, evidence analysis, and next clinical steps.
Respond ONLY with valid JSON matching this schema exactly:
{
  "hypothesis": "string — primary diagnosis (concise clinical name)",
  "confidence": number between 0.0 and 1.0,
  "evidenceSupporting": ["array of strings — each item is specific evidence supporting this diagnosis from the provided symptoms/history"],
  "evidenceAgainst": ["array of strings — each item is evidence that argues against this diagnosis, or alternative diagnoses to consider"],
  "nextSteps": ["array of 3-5 strings — specific, actionable next clinical steps ordered by priority"]
}`;

export async function runClinicalReasoning(symptoms: string[], history: string[]): Promise<ReasoningResult> {
  try {
    const userContent = [
      `Symptoms: ${symptoms.length > 0 ? symptoms.join(", ") : "none provided"}`,
      history.length > 0 ? `Patient history: ${history.join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const rawParams: any = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
    };
    const safeParams = applyPHIGuard(rawParams, "msClinicalReasoningAgent");
    const response = await openai.chat.completions.create(safeParams);

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from OpenAI");

    const parsed = JSON.parse(raw) as ReasoningResult;
    return {
      hypothesis: parsed.hypothesis || "Undetermined",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      evidenceSupporting: Array.isArray(parsed.evidenceSupporting) ? parsed.evidenceSupporting : [],
      evidenceAgainst: Array.isArray(parsed.evidenceAgainst) ? parsed.evidenceAgainst : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    };
  } catch (err: any) {
    console.error("[ClinicalReasoning] OpenAI error, using rule-based fallback:", err?.message);
    return fallbackReasoning(symptoms, history);
  }
}

function fallbackReasoning(symptoms: string[], _history: string[]): ReasoningResult {
  const s = symptoms.map((x) => x.toLowerCase());
  if (s.some((x) => /fever|chills|rigors/.test(x))) {
    return {
      hypothesis: "Infectious / febrile illness",
      confidence: 0.65,
      evidenceSupporting: symptoms.filter((x) => /fever|chill|malaise|sweats/i.test(x)),
      evidenceAgainst: ["Viral vs. bacterial source indeterminate without labs"],
      nextSteps: ["CBC with differential", "Blood cultures if temp >38.5°C", "Consider CXR if respiratory symptoms", "Urinalysis if urinary symptoms"],
    };
  }
  if (s.some((x) => /cough|sore throat|congestion|rhinorrhea/.test(x))) {
    return {
      hypothesis: "Upper respiratory tract infection",
      confidence: 0.6,
      evidenceSupporting: symptoms.filter((x) => /cough|throat|congestion|runny|rhinorrhea/i.test(x)),
      evidenceAgainst: ["Lower respiratory tract involvement not ruled out"],
      nextSteps: ["Rapid flu/COVID-19 antigen test", "Strep throat swab if pharyngitis", "CXR if fever + productive cough", "Supportive care — hydration, antipyretics"],
    };
  }
  return {
    hypothesis: "Undifferentiated — further evaluation required",
    confidence: 0.3,
    evidenceSupporting: symptoms,
    evidenceAgainst: ["Insufficient symptom specificity for single diagnosis"],
    nextSteps: ["Complete history and focused physical examination", "Basic metabolic panel + CBC", "Directed imaging based on examination findings", "Consider specialist consult"],
  };
}
