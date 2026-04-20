/**
 * server/research/openaiCodeRefiner.ts
 * Step C: GPT-4o Code Refiner Pass
 *
 * Takes the original code proposal (Step A) + the safety reviewer's findings
 * (Step B) and produces a refined, improved version that:
 *   - Addresses all "revise" concerns from the review
 *   - Preserves all safety gates and HIPAA/FDA constraints
 *   - Documents what was changed and what risks remain
 *
 * If the reviewer verdict was "reject", the refiner acknowledges this and
 * produces a "do not implement" record explaining why.
 */

import type { CodeProposal } from "./autoCodeProposalEngine";
import type { ClaudeReview }  from "./claudeReviewAgent";

export type RefinedCodeProposal = {
  files: { path: string; content: string; explanation: string }[];
  changesSummary: string;
  resolvedConcerns: string[];
  remainingRisks: string[];
};

const REFINER_SYSTEM = `You are a senior TypeScript engineer for Auralyn, a HIPAA-compliant, FDA-regulated medical triage system.

You have been given:
1. An initial code proposal
2. A critical safety review identifying concerns

Your job: produce a REVISED, IMPROVED version of the code that:
- Addresses every concern flagged by the reviewer
- Preserves all safety gates (hallucination controls, physician review, audit logging)
- Is production-ready TypeScript — no TODOs, no pseudocode
- Documents exactly what was changed to address each concern

If the reviewer verdict was "reject", do NOT produce code. Instead return a single
file with explanation of why this should not be implemented.

Return strict JSON:
{
  "files": [
    {
      "path": "server/path/to/file.ts",
      "content": "FULL file content — complete, not a diff",
      "explanation": "What changed from v1 and why"
    }
  ],
  "changesSummary": "2-3 sentence summary of what was improved in this revision",
  "resolvedConcerns": ["each concern that was addressed and how"],
  "remainingRisks": ["any risks that could NOT be resolved and require physician/FDA review before deployment"]
}`;

export async function refineCodeProposal(args: {
  original:  CodeProposal;
  review:    ClaudeReview;
  articleTitle: string;
}): Promise<RefinedCodeProposal> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing — code refiner unavailable");

  const filesSection = args.original.files
    .map(f => `FILE: ${f.path}\nExplanation: ${f.explanation}\n\`\`\`typescript\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  const userPrompt = `
Article: "${args.articleTitle}"

=== ORIGINAL CODE PROPOSAL (v1) ===
Summary: ${args.original.summary}
Author's concerns: ${args.original.concerns.join("; ") || "none"}

${filesSection || "(no files in original proposal)"}

=== SAFETY REVIEW FINDINGS ===
Verdict: ${args.review.overallVerdict.toUpperCase()}
Concerns: ${args.review.concerns.join("\n- ")}
Safety flags: ${args.review.safetyFlags.join("\n- ")}
HIPAA risks: ${args.review.hipaaRisks.join("\n- ")}
FDA risks: ${args.review.fdaRisks.join("\n- ")}
Suggestions: ${args.review.suggestions.join("\n- ")}

Produce the refined v2 code that addresses all reviewer concerns.
${args.review.overallVerdict === "reject" ? "Verdict is REJECT — do not produce implementation. Explain why in the files field." : ""}
`.trim();

  try {
    const OpenAI = require("openai").default ?? require("openai");
    const openai = new OpenAI({ apiKey });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REFINER_SYSTEM },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as RefinedCodeProposal;

    if (!Array.isArray(parsed.files) || !parsed.changesSummary) {
      throw new Error("GPT-4o Refiner returned invalid structure");
    }

    return parsed;
  } catch (err: any) {
    console.error("[openaiCodeRefiner] Refiner call failed:", err?.message);
    return {
      files: [],
      changesSummary: `Refinement failed: ${err?.message ?? "unknown error"}. Use original proposal with manual review.`,
      resolvedConcerns: [],
      remainingRisks: ["Refinement pipeline failed — manual engineering review required before implementation."],
    };
  }
}
