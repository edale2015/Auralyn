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

import OpenAI from "openai";
import type { CodeProposal }       from "./autoCodeProposalEngine";
import type { ClaudeReview }       from "./claudeReviewAgent";
import type { ClaudeSliceReview }  from "./claudeCodeSliceReview";

export type RefinedCodeProposal = {
  files: { path: string; content: string; explanation: string }[];
  changesSummary: string;
  resolvedConcerns: string[];
  remainingRisks: string[];
  additionalRecommendations?: string[];
};

const REFINER_SYSTEM = `You are a senior TypeScript engineer for Auralyn, a HIPAA-compliant, FDA-regulated medical triage system.

You have been given:
1. The actual source code files being reviewed
2. An initial code proposal from GPT-4o (Step A architect)
3. A Claude adversarial safety review — HIPAA, FDA SaMD, clinical safety (Step B)
4. A Claude architecture/coupling review — import graph, interface contracts, blast radius (Step B2)

Your job: produce a REVISED, IMPROVED version of the code that:
- Addresses EVERY concern flagged by both Claude reviewers — leave nothing unaddressed
- Respects the coupling blast-radius (update callers if needed)
- Preserves all safety gates (hallucination controls, physician review, audit logging)
- Is production-ready TypeScript — no TODOs, no pseudocode, no placeholder comments
- Documents exactly what was changed to address each concern

CRITICAL RULES:
1. ALL improvements must appear as actual code in the "files" array. Never leave an improvement as a bullet point.
2. "remainingRisks" is ONLY for genuine human decisions that CANNOT be resolved in code — for example: "Algorithm threshold 0.7 requires clinical validation by a physician" or "This data retention policy needs HIPAA legal review." DO NOT use remainingRisks for code suggestions.
3. After addressing Claude's concerns, identify any additional improvements you want to make to the code. List each one in "additionalRecommendations" — these will be auto-implemented in the next step.
4. Never append bullet points, suggestions, or notes after your JSON. Return ONLY the JSON.

If the safety reviewer verdict was "reject", do NOT produce implementation code. Return a single explanation file.
If the architecture reviewer verdict was "hold", flag prominently but still produce code with "HOLD" warnings in comments.

Return STRICT JSON — nothing before or after it:
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
  "remainingRisks": ["ONLY genuine physician/FDA/legal decisions that cannot be coded — NOT code suggestions"],
  "additionalRecommendations": ["Additional code improvement you identified but have not yet implemented — will be auto-implemented in Step D"]
}`;

export async function refineCodeProposal(args: {
  original:     CodeProposal;
  review:       ClaudeReview;
  sliceReview:  ClaudeSliceReview;
  articleTitle: string;
}): Promise<RefinedCodeProposal> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
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
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

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

// ── Step D: Auto-implement GPT-4o's own additional recommendations ──────────
// Takes the bullet-point recommendations from Step C and turns them into real code.

const STEP_D_SYSTEM = `You are a senior TypeScript engineer for Auralyn, a HIPAA-compliant, FDA-regulated medical triage system.

You have been given:
1. A set of code files that have already been improved by a prior review pass
2. A list of additional code improvements that were identified but not yet implemented

Your job: implement EVERY item in the additional improvements list as production-ready TypeScript code.

Rules:
- Return the COMPLETE content of each modified file — not diffs, not snippets
- Only include files that actually change
- Each improvement must be fully implemented — no TODO comments, no pseudocode
- Preserve all existing safety gates, HIPAA controls, and audit logging
- If an improvement item is too vague to implement safely, skip it and note why in "skipped"

Return STRICT JSON — nothing before or after it:
{
  "files": [
    {
      "path": "server/path/to/file.ts",
      "content": "FULL file content",
      "explanation": "Which additional recommendation this implements and what changed"
    }
  ],
  "implementedCount": 3,
  "skipped": ["optional — items that were too vague or unsafe to implement, with reason"]
}`;

export async function implementAdditionalRecommendations(args: {
  additionalRecommendations: string[];
  existingFiles: { path: string; content: string; explanation: string }[];
  articleTitle: string;
}): Promise<{ files: { path: string; content: string; explanation: string }[]; skipped: string[] }> {
  if (args.additionalRecommendations.length === 0) {
    return { files: [], skipped: [] };
  }

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[Step D] No API key — skipping self-implementation");
    return { files: [], skipped: args.additionalRecommendations };
  }

  const filesSection = args.existingFiles
    .map(f => `FILE: ${f.path}\n\`\`\`typescript\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  const recsSection = args.additionalRecommendations
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  const userPrompt = `
Context: "${args.articleTitle}"

=== ALREADY-IMPROVED CODE FILES (from Step C) ===
${filesSection || "(none)"}

=== ADDITIONAL IMPROVEMENTS TO IMPLEMENT NOW ===
${recsSection}

Implement each of the above improvements as complete TypeScript code changes.
`.trim();

  try {
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STEP_D_SYSTEM },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as {
      files: { path: string; content: string; explanation: string }[];
      implementedCount: number;
      skipped?: string[];
    };

    return {
      files:   Array.isArray(parsed.files) ? parsed.files : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
    };
  } catch (err: any) {
    console.error("[Step D] Failed:", err?.message);
    return { files: [], skipped: args.additionalRecommendations };
  }
}
