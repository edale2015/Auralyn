/**
 * LLM-powered Cardiology specialist agent.
 * Uses GPT-4o-mini with a cardiology system prompt; falls back to rule-based if OpenAI unavailable.
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

export class CardiologyLLMAgent {
  readonly name = "Cardiology";

  async evaluate(ctx: Record<string, unknown>): Promise<SpecialistOpinion> {
    if (!process.env.OPENAI_API_KEY) {
      return this.fallback(ctx);
    }

    try {
      const ai = getOpenAI();
      const prompt = `You are a board-certified cardiologist reviewing a patient case. Analyse the data below and return ONLY valid JSON with keys: diagnosis (string), confidence (0-1 float), reasoning (string), icd10 (string).

Patient data:
${JSON.stringify(ctx, null, 2)}`;

      const response = await ai.chat.completions.create({
        model:    "gpt-4o-mini",
        messages: [
          { role: "system", content: "Expert cardiologist. Return only valid JSON." },
          { role: "user",   content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
      return {
        specialist: this.name,
        diagnosis:  String(parsed.diagnosis ?? "Low cardiac risk"),
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
    const hasChestPain   = symptoms.chestPain;
    const hasTachycardia = (vitals.hr ?? 0) > 100;

    if (hasChestPain && hasTachycardia) {
      return { specialist: this.name, diagnosis: "Possible ACS", confidence: 0.7, reasoning: "Chest pain + tachycardia pattern", icd10: "I21.9" };
    }
    if (hasChestPain) {
      return { specialist: this.name, diagnosis: "Atypical chest pain — workup needed", confidence: 0.5, reasoning: "Chest pain without haemodynamic compromise", icd10: "R07.9" };
    }
    return { specialist: this.name, diagnosis: "Low cardiac risk", confidence: 0.2, reasoning: "No high-risk cardiac features", icd10: "Z03.89" };
  }
}
