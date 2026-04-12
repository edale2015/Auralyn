/**
 * LLM-powered Pulmonary specialist agent.
 * Uses GPT-4o-mini with a pulmonary system prompt; falls back to rule-based if OpenAI unavailable.
 */

let _openai: any = null;

function getOpenAI() {
  if (!_openai) {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export interface SpecialistOpinion {
  specialist:  string;
  diagnosis:   string;
  confidence:  number;
  reasoning:   string;
  icd10?:      string;
}

export class PulmonaryLLMAgent {
  readonly name = "Pulmonary";

  async evaluate(ctx: Record<string, unknown>): Promise<SpecialistOpinion> {
    if (!process.env.OPENAI_API_KEY) {
      return this.fallback(ctx);
    }

    try {
      const ai = getOpenAI();
      const prompt = `You are a board-certified pulmonologist reviewing a patient case. Analyse the data below and return ONLY valid JSON with keys: diagnosis (string), confidence (0-1 float), reasoning (string), icd10 (string).

Patient data:
${JSON.stringify(ctx, null, 2)}`;

      const response = await ai.chat.completions.create({
        model:    "gpt-4o-mini",
        messages: [
          { role: "system", content: "Expert pulmonologist. Return only valid JSON." },
          { role: "user",   content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
      return {
        specialist: this.name,
        diagnosis:  String(parsed.diagnosis ?? "Low pulmonary risk"),
        confidence: Number(parsed.confidence ?? 0.3),
        reasoning:  String(parsed.reasoning  ?? ""),
        icd10:      String(parsed.icd10 ?? ""),
      };
    } catch {
      return this.fallback(ctx);
    }
  }

  private fallback(ctx: Record<string, unknown>): SpecialistOpinion {
    const vitals   = (ctx.vitals   as Record<string, number>)  ?? {};
    const symptoms = (ctx.symptoms as Record<string, boolean>) ?? {};
    const hasDyspnea = symptoms.sob || symptoms.dyspnea;
    const lowO2      = (vitals.spo2 ?? 99) < 93;

    if (hasDyspnea && lowO2) {
      return { specialist: this.name, diagnosis: "Acute respiratory compromise", confidence: 0.85, reasoning: "Dyspnea + hypoxia pattern", icd10: "J96.00" };
    }
    if (lowO2) {
      return { specialist: this.name, diagnosis: "Hypoxia — investigate PE or Pneumonia", confidence: 0.65, reasoning: "Isolated hypoxia without dyspnea", icd10: "R09.02" };
    }
    if (hasDyspnea) {
      return { specialist: this.name, diagnosis: "Dyspnea — COPD or cardiac aetiology", confidence: 0.5, reasoning: "Dyspnea without confirmed hypoxia", icd10: "R06.00" };
    }
    return { specialist: this.name, diagnosis: "Low pulmonary risk", confidence: 0.2, reasoning: "No high-risk respiratory features", icd10: "Z03.89" };
  }
}
