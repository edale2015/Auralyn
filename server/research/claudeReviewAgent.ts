/**
 * server/research/claudeReviewAgent.ts
 * Step B: AI Safety Review Pass ("Claude Review")
 *
 * Uses GPT-4o with a dedicated clinical safety reviewer persona to critically
 * review the code proposal from Step A.
 *
 * Labeled "Claude Review" in the UI. When an ANTHROPIC_API_KEY is added as
 * an environment secret, this module can be upgraded to use real Claude (Sonnet/Opus)
 * — the interface and return shape are identical.
 *
 * This reviewer is adversarial by design: it looks for everything that could
 * go wrong — HIPAA violations, FDA non-compliance, safety gate bypasses,
 * hallucination risks, and clinical logic errors.
 */

export type ClaudeReview = {
  overallVerdict: "approve" | "revise" | "reject";
  concerns:       string[];
  suggestions:    string[];
  safetyFlags:    string[];
  hipaaRisks:     string[];
  fdaRisks:       string[];
};

const REVIEWER_SYSTEM = `You are an adversarial clinical AI safety reviewer for Auralyn, a multi-tenant NYC urgent care triage system that is seeking FDA 510(k) clearance as a Software as a Medical Device (SaMD).

Your sole job is to find every possible problem with the proposed code changes:
- HIPAA violations (PHI exposure, audit gaps, consent issues)
- FDA SaMD non-compliance (unvalidated algorithm changes, missing audit annotations)
- Clinical safety risks (hallucination pathways, wrong thresholds, safety gate bypasses)
- Software quality issues (injection risks, unhandled errors, missing type safety)
- Architectural regressions (breaking existing safety contracts, removing validation)

You are NOT a cheerleader. You are NOT looking for what is good.
You are looking for every reason to reject or require revision.

Verdict logic:
- "approve" — only if you find zero safety concerns and minimal code quality issues
- "revise" — if there are fixable concerns (most common outcome)
- "reject" — if there are fundamental safety or HIPAA/FDA violations

Return strict JSON:
{
  "overallVerdict": "approve" | "revise" | "reject",
  "concerns": ["general architectural or logical concerns"],
  "suggestions": ["specific actionable fixes for each concern"],
  "safetyFlags": ["clinical safety issues — wrong thresholds, safety bypass risks"],
  "hipaaRisks": ["PHI exposure, audit logging, consent, access control issues"],
  "fdaRisks": ["FDA SaMD / 21 CFR Part 11 / ISO 13485 compliance issues"]
}`;

export async function runClaudeReview(args: {
  codeProposal: { files: { path: string; content: string; explanation: string }[]; summary: string; concerns: string[] };
  articleTitle: string;
  articleSummary: string | null;
}): Promise<ClaudeReview> {

  // ── Option 1: Real Claude via Anthropic API (if key is present) ──────────
  // Accept both ANTHROPIC_API_KEY and Anthropic_API_Key (Replit secret name variations)
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
  if (anthropicKey) {
    try {
      const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });

      const userContent = buildReviewPrompt(args);
      const msg = await client.messages.create({
        model:      "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        system:     REVIEWER_SYSTEM,
        messages:   [{ role: "user", content: userContent }],
      });

      const raw = (msg.content[0] as any)?.text?.trim() ?? "";
      return JSON.parse(raw.replace(/```json|```/g, "").trim()) as ClaudeReview;
    } catch (err: any) {
      console.warn("[claudeReviewAgent] Anthropic API failed, falling back to GPT-4o reviewer:", err?.message);
    }
  }

  // ── Option 2: GPT-4o with adversarial safety reviewer persona (default) ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No AI API key available for code review (OPENAI_API_KEY or ANTHROPIC_API_KEY required)");

  const userContent = buildReviewPrompt(args);

  try {
    const OpenAI = require("openai").default ?? require("openai");
    const openai = new OpenAI({ apiKey });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REVIEWER_SYSTEM },
        { role: "user",   content: userContent },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as ClaudeReview;

    if (!parsed.overallVerdict || !Array.isArray(parsed.concerns)) {
      throw new Error("Reviewer returned invalid structure");
    }

    return parsed;
  } catch (err: any) {
    console.error("[claudeReviewAgent] Review call failed:", err?.message);
    return {
      overallVerdict: "revise",
      concerns:       [`Review call failed: ${err?.message ?? "unknown error"}`],
      suggestions:    ["Manual clinical engineer review required before any implementation."],
      safetyFlags:    ["UNKNOWN — automated review failed, treat as high-risk"],
      hipaaRisks:     ["UNKNOWN — automated review failed"],
      fdaRisks:       ["UNKNOWN — automated review failed"],
    };
  }
}

function buildReviewPrompt(args: {
  codeProposal: { files: { path: string; content: string; explanation: string }[]; summary: string; concerns: string[] };
  articleTitle: string;
  articleSummary: string | null;
}): string {
  const filesSection = args.codeProposal.files
    .map(f => `FILE: ${f.path}\nExplanation: ${f.explanation}\n\`\`\`typescript\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `
Source article: "${args.articleTitle}"
Article summary: ${(args.articleSummary ?? "(none)").slice(0, 500)}

Proposed code changes:
Summary: ${args.codeProposal.summary}
Author's own concerns: ${args.codeProposal.concerns.join("; ") || "none stated"}

Files:
${filesSection || "(no files — proposal contained no concrete changes)"}

Review every aspect of this code proposal. Be thorough and adversarial.
`.trim();
}
