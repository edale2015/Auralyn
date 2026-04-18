/**
 * server/research/openaiReviewClient.ts
 * OpenAI Review Stage — second-pass conservative clinical planner.
 *
 * Receives Claude's recommendations + relevant code, returns structured
 * upgrade proposals with safety concerns, validation plans, and verdicts.
 *
 * Uses chat completions with JSON mode (compatible with all openai package versions).
 * Model: gpt-4o for structured clinical review quality.
 */

export type OpenAIReviewRequest = {
  claudeRecommendations: string;
  relevantCode:          Record<string, string>;
  articleSummary?:       string;
  systemContext?:        string;
};

export type OpenAIReviewResponse = {
  summaryForUser: string;
  recommendedUpgrades: Array<{
    title:               string;
    rationale:           string;
    affectedFiles:       string[];
    codeRecommendations: string[];
    safetyConcerns:      string[];
    validationPlan:      string[];
    verdict:             "adopt" | "test_only" | "ignore";
  }>;
  overallVerdict: "adopt" | "test_only" | "ignore";
};

const SYSTEM_PROMPT = `You are a conservative clinical AI safety reviewer for Auralyn, a multi-tenant NYC urgent care triage system.

Your job:
1. Summarize the recommendations for the physician in 2-4 short paragraphs (summaryForUser).
2. Recommend code upgrades ONLY if they are clinically and architecturally safe.
3. Be explicitly conservative about anything that could affect triage, safety, disposition, or hallucination controls.
4. Flag any safety concern clearly — even minor ones.
5. Return strict JSON matching the schema below.

Non-negotiable constraints:
- Never weaken hallucination safeguards
- Never bypass physician review
- Never allow RAG outputs to directly set final disposition
- Never remove validation gates
- Prefer additive, small-diff changes`;

export async function runOpenAIReviewStage(
  payload: OpenAIReviewRequest,
): Promise<OpenAIReviewResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing — OpenAI review stage unavailable");

  const codeSection = Object.entries(payload.relevantCode)
    .map(([file, code]) => `FILE: ${file}\n\`\`\`\n${code.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  const userPrompt = `
Context:
${payload.systemContext ?? "Medical triage platform with validation gates, hallucination controls, physician review, and audit logging."}

Article summary:
${payload.articleSummary ?? "N/A"}

Claude recommendations:
${payload.claudeRecommendations}

Relevant code:
${codeSection || "(no code provided — base review on recommendations only)"}

Return JSON with this exact shape:
{
  "summaryForUser": "2-4 paragraph summary for the physician",
  "recommendedUpgrades": [
    {
      "title": "string",
      "rationale": "string",
      "affectedFiles": ["string"],
      "codeRecommendations": ["string"],
      "safetyConcerns": ["string"],
      "validationPlan": ["string"],
      "verdict": "adopt" | "test_only" | "ignore"
    }
  ],
  "overallVerdict": "adopt" | "test_only" | "ignore"
}`.trim();

  try {
    // Use OpenAI npm package (already installed)
    const OpenAI = require("openai").default ?? require("openai");
    const openai = new OpenAI({ apiKey });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as OpenAIReviewResponse;

    // Validate shape minimally
    if (!parsed.summaryForUser || !Array.isArray(parsed.recommendedUpgrades)) {
      throw new Error("OpenAI review returned invalid structure");
    }

    return parsed;
  } catch (err: any) {
    // Fallback: return conservative placeholder so pipeline doesn't break
    if (err.message?.includes("OPENAI_API_KEY")) throw err;
    console.error("[openaiReviewClient] OpenAI call failed:", err?.message);

    return {
      summaryForUser: `OpenAI review unavailable: ${err?.message ?? "unknown error"}. Claude recommendations are shown below. Manual physician review required before any changes.`,
      recommendedUpgrades: [],
      overallVerdict: "ignore",
    };
  }
}
