/**
 * server/research/openaiCodeRefiner.ts
 * Step C: GPT-4o Code Refiner
 *
 * Receives three inputs:
 *   - original:     Step A — GPT-4o Architect's first-pass code proposal
 *   - review:       Step B — Claude adversarial safety review (HIPAA/FDA/clinical)
 *   - sliceReview:  Step B2 — Claude architecture/coupling review (import-aware)
 *
 * Produces a refined v2 that addresses ALL concerns from both Claude passes,
 * and documents what risks remain for human sign-off.
 */

import type { CodeProposal }       from "./autoCodeProposalEngine";
import type { ClaudeReview }       from "./claudeReviewAgent";
import type { ClaudeSliceReview }  from "./claudeCodeSliceReview";

export type RefinedCodeProposal = {
  files: { path: string; content: string; explanation: string }[];
  changesSummary: string;
  resolvedConcerns: string[];
  remainingRisks: string[];
};

const REFINER_SYSTEM = `You are a senior TypeScript engineer for Auralyn, a HIPAA-compliant, FDA-regulated medical triage system.

You have been given:
1. An initial code proposal from GPT-4o (the architect)
2. A Claude adversarial safety review (HIPAA, FDA SaMD, clinical safety)
3. A Claude architecture/coupling review (import graph, interface contracts, blast radius)

Your job: produce a REVISED, IMPROVED version of the code that:
- Addresses every concern flagged by both Claude reviewers
- Respects the coupling blast-radius (update callers if needed)
- Preserves all safety gates (hallucination controls, physician review, audit logging)
- Is production-ready TypeScript — no TODOs, no pseudocode
- Documents exactly what was changed to address each concern
- For open questions flagged by the architecture reviewer, add a TODO comment referencing the question

If the safety reviewer verdict was "reject", do NOT produce implementation code. Return a single explanation file.
If the architecture reviewer verdict was "hold", flag prominently but still produce code with "HOLD" warnings in comments.

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
  "remainingRisks": ["any risks that could NOT be resolved — require physician/FDA review before deployment"]
}`;

export async function refineCodeProposal(args: {
  original:     CodeProposal;
  review:       ClaudeReview;
  sliceReview:  ClaudeSliceReview;
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

=== CLAUDE SAFETY REVIEW FINDINGS (Step B) ===
Verdict: ${args.review.overallVerdict.toUpperCase()}
Concerns: ${args.review.concerns.length > 0 ? "- " + args.review.concerns.join("\n- ") : "none"}
Safety flags: ${args.review.safetyFlags.length > 0 ? "- " + args.review.safetyFlags.join("\n- ") : "none"}
HIPAA risks: ${args.review.hipaaRisks.length > 0 ? "- " + args.review.hipaaRisks.join("\n- ") : "none"}
FDA risks: ${args.review.fdaRisks.length > 0 ? "- " + args.review.fdaRisks.join("\n- ") : "none"}
Suggestions: ${args.review.suggestions.length > 0 ? "- " + args.review.suggestions.join("\n- ") : "none"}
${args.review.overallVerdict === "reject" ? "\n⛔ SAFETY REVIEW VERDICT IS REJECT — do not produce implementation. Explain why in the files field." : ""}

=== CLAUDE ARCHITECTURE/COUPLING REVIEW FINDINGS (Step B2) ===
Verdict: ${args.sliceReview.verdict.toUpperCase()} (Confidence: ${args.sliceReview.confidenceScore}/100)
Architecture notes: ${args.sliceReview.architectureNotes.length > 0 ? "- " + args.sliceReview.architectureNotes.join("\n- ") : "none"}
Coupling risks: ${args.sliceReview.couplingRisks.length > 0 ? "- " + args.sliceReview.couplingRisks.join("\n- ") : "none"}
Interface risks: ${args.sliceReview.interfaceRisks.length > 0 ? "- " + args.sliceReview.interfaceRisks.join("\n- ") : "none"}
Specific recommendations: ${args.sliceReview.specificRecommendations.length > 0 ? "- " + args.sliceReview.specificRecommendations.join("\n- ") : "none"}
Blast radius (files needing updates): ${args.sliceReview.blastRadius.length > 0 ? "- " + args.sliceReview.blastRadius.join("\n- ") : "none"}
Open questions for human review: ${args.sliceReview.openQuestions.length > 0 ? "- " + args.sliceReview.openQuestions.join("\n- ") : "none"}
${args.sliceReview.verdict === "hold" ? "\n⚠️ ARCHITECTURE REVIEW IS HOLD — flag prominently with HOLD comments in the code." : ""}

Produce the refined v2 code that addresses concerns from both Claude reviewers.
`.trim();

  try {
    const OpenAI = require("openai").default ?? require("openai");
    const openai = new OpenAI({ apiKey });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      4000,
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
