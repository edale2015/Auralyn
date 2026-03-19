import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

export interface ExplanationInput {
  complaint: string;
  answers: any;
  evaluation: any;
}

export async function generateClinicalExplanation(input: ExplanationInput): Promise<string> {
  const prompt = `You are a clinical decision support system providing an explanation to a supervising physician.

Patient complaint: ${input.complaint}

Patient answers:
${JSON.stringify(input.answers, null, 2)}

System decision:
${JSON.stringify(input.evaluation, null, 2)}

Provide a concise clinical explanation covering:
1. Most likely diagnosis and reasoning
2. Safety assessment — why this disposition is appropriate or requires caution
3. Red flags that would change management
4. Recommended next steps

Keep the response clinical, evidence-based, and under 200 words.`;

  try {
    const res = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
    });

    return res.choices[0]?.message?.content || "Explanation unavailable.";
  } catch (err: any) {
    console.error("[GPTExplanation] Error:", err.message);
    return `Explanation generation failed: ${err.message}`;
  }
}
