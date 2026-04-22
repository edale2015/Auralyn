/**
 * server/research/standaloneCodeReview.ts
 * Standalone App Code Review — no article required
 *
 * Per-slice pipeline (new):
 *   For each file in the group:
 *     1. Claude analyzes the raw file → HIPAA, FDA, safety, quality issues + recommendations
 *     2. GPT-4o receives file + Claude's recommendations → writes the improved code
 *   Combined slice results → Step B (Claude safety review) → B2 (arch review) → C (refiner) → D
 *
 * Triggered by POST /api/research/app-code-review
 */

import * as fs   from "fs";
import * as path from "path";
import OpenAI    from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db }                    from "../db";
import { agentHandoffs }         from "../../shared/schema";
import { runClaudeReview }       from "./claudeReviewAgent";
import { runClaudeSliceReview }  from "./claudeCodeSliceReview";
import { refineCodeProposal, implementAdditionalRecommendations } from "./openaiCodeRefiner";
import type { CodeProposal }     from "./autoCodeProposalEngine";

// ── Curated high-value files for proactive review ─────────────────────────

const HIGH_VALUE_FILE_GROUPS = [
  {
    groupName: "Clinical Safety & Triage",
    files: [
      "server/clinical/safetyGate.ts",
      "server/clinical/clinicalDispositionEngine.ts",
      "server/ai/triageEngine.ts",
    ],
  },
  {
    groupName: "AI & Probabilistic Reasoning",
    files: [
      "server/ai/bayesianNetwork.ts",
      "server/clinical/hallucinationExtensions.ts",
    ],
  },
  {
    groupName: "FDA Compliance & Audit",
    files: [
      "server/fda/fdaAuditChain.ts",
      "server/validation/calibrationMonitor.ts",
    ],
  },
  {
    groupName: "EHR Integration",
    files: [
      "server/ehr/fhir/fhirClient.ts",
    ],
  },
];

const PROJECT_ROOT  = process.cwd();
const MAX_FILE_CHARS = 2500;

function loadFile(shortPath: string): string | null {
  const abs = path.join(PROJECT_ROOT, shortPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const content = fs.readFileSync(abs, "utf-8");
    return content.slice(0, MAX_FILE_CHARS);
  } catch {
    return null;
  }
}

function pickReviewGroup(seed?: string): typeof HIGH_VALUE_FILE_GROUPS[0] {
  const dayIndex = seed
    ? 0
    : Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % HIGH_VALUE_FILE_GROUPS.length;
  return HIGH_VALUE_FILE_GROUPS[dayIndex];
}

// ── Per-Slice Types ─────────────────────────────────────────────────────────

export type SliceAnalysis = {
  issues:          string[];
  hipaaRisks:      string[];
  fdaRisks:        string[];
  safetyFlags:     string[];
  recommendations: string[];
  verdict:         "approve" | "needs_improvement" | "critical_issues";
};

export type PerSliceResult = {
  path:            string;
  claudeAnalysis:  SliceAnalysis;
  gptExplanation:  string;
};

// ── Step A-slice: Claude analyzes one raw file ──────────────────────────────

const CLAUDE_SLICE_REVIEW_SYSTEM = `You are an expert clinical software safety reviewer for Auralyn, a HIPAA/FDA-regulated medical triage SaaS for NYC urgent care (FDA 510(k) candidate, SaMD Class II).

You will be given ONE TypeScript source file. Review it for every possible issue:
1. HIPAA compliance gaps — PHI handling, audit logging, access control, consent flows
2. FDA SaMD non-compliance — 21 CFR Part 11 audit chain, algorithm annotation, change control
3. Clinical safety risks — wrong thresholds, safety gate bypasses, hallucination pathways, edge-case mishandling
4. Code quality — null safety, unhandled errors, type safety, injection risks, resource leaks

Return STRICT JSON only — nothing before or after:
{
  "issues":          ["specific concrete issues found in the code — reference actual line content"],
  "hipaaRisks":      ["HIPAA/PHI-specific risks with file location"],
  "fdaRisks":        ["FDA SaMD non-compliance issues with file location"],
  "safetyFlags":     ["clinical safety risks that could harm patients"],
  "recommendations": ["concrete actionable fix for each issue — describe exactly what to change and why"],
  "verdict":         "approve" | "needs_improvement" | "critical_issues"
}

If the file looks correct, return: { "issues": [], "hipaaRisks": [], "fdaRisks": [], "safetyFlags": [], "recommendations": [], "verdict": "approve" }`;

async function analyzeSliceWithClaude(
  file:      { path: string; content: string },
  groupName: string
): Promise<SliceAnalysis> {
  const userPrompt = `Group: ${groupName}
File: ${file.path}

\`\`\`typescript
${file.content}
\`\`\`

Review this file completely. Identify every HIPAA, FDA SaMD, clinical safety, and code quality issue.`;

  // Try real Claude (Anthropic) first
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model:      "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        system:     CLAUDE_SLICE_REVIEW_SYSTEM,
        messages:   [{ role: "user", content: userPrompt }],
      });
      const raw = (msg.content[0] as any)?.text?.trim() ?? "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as SliceAnalysis;
      if (!Array.isArray(parsed.issues)) throw new Error("Invalid structure");
      return parsed;
    } catch (e: any) {
      console.warn(`[slice-claude] Anthropic failed for ${file.path}, falling back to GPT-4o:`, e?.message);
    }
  }

  // Fallback: GPT-4o with Claude safety reviewer persona
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No AI API key available for slice review");

  const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  const resp = await openai.chat.completions.create({
    model:           "gpt-4o",
    max_tokens:      1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLAUDE_SLICE_REVIEW_SYSTEM },
      { role: "user",   content: userPrompt },
    ],
  });

  const raw    = resp.choices[0]?.message?.content?.trim() ?? "";
  const parsed = JSON.parse(raw) as SliceAnalysis;
  if (!Array.isArray(parsed.issues)) throw new Error("Invalid structure from GPT-4o fallback");
  return parsed;
}

// ── Step B-slice: GPT-4o codes one file using Claude's analysis ─────────────

const GPT4O_SLICE_CODER_SYSTEM = `You are a principal TypeScript engineer for Auralyn, a HIPAA/FDA-regulated medical triage SaaS. You will be given ONE TypeScript source file plus a safety analysis from our clinical reviewer.

Your task: implement every recommendation from the safety analysis. Write the COMPLETE improved file — not a diff, the entire file with all improvements incorporated, production-ready.

Focus on:
- Fixing every HIPAA, FDA SaMD, clinical safety, and code quality issue identified
- Preserving all existing functionality — do not remove working features
- Adding only what is needed, not speculative changes

Return STRICT JSON only:
{
  "content":     "FULL improved TypeScript file — complete, compilable",
  "explanation": "2-4 sentences: what was changed, which issues were resolved, and what was deliberately left unchanged"
}`;

async function codeSliceWithGPT4o(
  file:     { path: string; content: string },
  analysis: SliceAnalysis
): Promise<{ content: string; explanation: string }> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for per-slice coding");

  const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

  const issueList = [
    ...analysis.issues,
    ...analysis.hipaaRisks.map(r => `[HIPAA] ${r}`),
    ...analysis.fdaRisks.map(r  => `[FDA] ${r}`),
    ...analysis.safetyFlags.map(s => `[SAFETY] ${s}`),
  ].join("\n");

  const userPrompt = `File to improve: ${file.path}

\`\`\`typescript
${file.content}
\`\`\`

Safety reviewer findings (implement ALL of these):
${analysis.recommendations.length > 0 ? analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n") : "No specific recommendations — file approved as-is."}

Issues found:
${issueList || "None"}

Write the complete improved TypeScript file implementing all recommendations.`;

  const resp = await openai.chat.completions.create({
    model:           "gpt-4o",
    max_tokens:      4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: GPT4O_SLICE_CODER_SYSTEM },
      { role: "user",   content: userPrompt },
    ],
  });

  const raw    = resp.choices[0]?.message?.content?.trim() ?? "";
  const parsed = JSON.parse(raw) as { content: string; explanation: string };
  if (typeof parsed.content !== "string" || parsed.content.length < 10) {
    throw new Error(`GPT-4o returned empty content for ${file.path}`);
  }
  return parsed;
}

// ── Step 1: Create handoff record synchronously (fast — DB only) ───────────

export async function createCodeReviewHandoff(options?: {
  groupName?: string;
}): Promise<{ handoffId: number; groupName: string }> {
  const { eq } = await import("drizzle-orm");

  const group = options?.groupName
    ? (HIGH_VALUE_FILE_GROUPS.find(g => g.groupName === options.groupName) ?? pickReviewGroup())
    : pickReviewGroup();

  const loadedFiles = group.files
    .map(fp => ({ path: fp, content: loadFile(fp) }))
    .filter((f): f is { path: string; content: string } => f.content !== null);

  if (loadedFiles.length === 0) {
    throw new Error(`No files found for group "${group.groupName}" — check file paths`);
  }

  const reviewTitle = `App Code Review — ${group.groupName} (${new Date().toLocaleDateString()})`;
  const sliceNames  = loadedFiles.map(f => path.basename(f.path)).join(", ");

  const [handoff] = await db
    .insert(agentHandoffs)
    .values({
      articleId:      0,
      articleTitle:   reviewTitle,
      articleUrl:     "#app-code-review",
      articleSummary: `${loadedFiles.length} slices ready (${sliceNames}) — Step A: Claude per-file analysis starting…`,
      pipelineStatus: "running",
    })
    .returning();

  return { handoffId: handoff.id, groupName: group.groupName };
}

// ── Step 2: Run the full AI pipeline for an existing handoff record ──────────

export async function runPipelineForHandoff(
  handoffId: number,
  options?: { groupName?: string }
): Promise<void> {
  const { eq } = await import("drizzle-orm");

  const group = options?.groupName
    ? (HIGH_VALUE_FILE_GROUPS.find(g => g.groupName === options.groupName) ?? pickReviewGroup())
    : pickReviewGroup();

  const loadedFiles = group.files
    .map(fp => ({ path: fp, content: loadFile(fp) }))
    .filter((f): f is { path: string; content: string } => f.content !== null);

  const reviewTitle = `App Code Review — ${group.groupName} (${new Date().toLocaleDateString()})`;
  const totalSlices = loadedFiles.length;

  console.log(`[standaloneCodeReview #${handoffId}] Group: "${group.groupName}" | ${totalSlices} slices: ${loadedFiles.map(f => f.path).join(", ")}`);

  // Helper: build a readable per-slice progress string
  function buildProgressMsg(
    sliceIndex: number,
    phase: "claude-analyzing" | "gpt-coding" | "done",
    doneCount: number
  ): string {
    const basename = path.basename(loadedFiles[sliceIndex].path);
    const phaseLabel = phase === "claude-analyzing"
      ? `Claude analyzing…`
      : phase === "gpt-coding"
      ? `Claude ✓ → GPT-4o coding…`
      : `Claude ✓ → GPT-4o ✓`;

    const parts = loadedFiles.map((f, i) => {
      const name = path.basename(f.path);
      if (i < sliceIndex || (i === sliceIndex && phase === "done")) return `${name}: ✓`;
      if (i === sliceIndex) return `${name}: ${phaseLabel}`;
      return `${name}: queued`;
    });

    return `Step A — ${doneCount}/${totalSlices} slices done | ${parts.join(" | ")}`;
  }

  try {
    // ── Per-slice Phase: Claude analyzes → GPT-4o codes (Step A in UI) ────

    const sliceResults: PerSliceResult[] = [];
    const codedFiles: Array<{ path: string; content: string; explanation: string }> = [];
    const allIssues: string[]          = [];
    const allHipaaRisks: string[]      = [];
    const allFdaRisks: string[]        = [];
    const allSafetyFlags: string[]     = [];
    const allRecommendations: string[] = [];

    for (let i = 0; i < loadedFiles.length; i++) {
      const file = loadedFiles[i];
      const basename = path.basename(file.path);

      // ── Phase 1: Claude analyzes the raw file ───────────────────────────
      console.log(`[standaloneCodeReview #${handoffId}] Slice ${i + 1}/${totalSlices}: Claude analyzing ${file.path}`);
      await db.update(agentHandoffs)
        .set({ articleSummary: buildProgressMsg(i, "claude-analyzing", i) })
        .where(eq(agentHandoffs.id, handoffId));

      const analysis = await analyzeSliceWithClaude(file, group.groupName);
      console.log(`[standaloneCodeReview #${handoffId}] Slice ${i + 1}/${totalSlices} [${basename}]: Claude verdict=${analysis.verdict} issues=${analysis.issues.length} recs=${analysis.recommendations.length}`);

      // ── Phase 2: GPT-4o codes the improved file using Claude's recs ─────
      await db.update(agentHandoffs)
        .set({ articleSummary: buildProgressMsg(i, "gpt-coding", i) })
        .where(eq(agentHandoffs.id, handoffId));

      let coded: { content: string; explanation: string };
      if (analysis.verdict === "approve" && analysis.recommendations.length === 0) {
        // File looks good — carry forward unchanged
        coded = { content: file.content, explanation: `${basename} — no issues found by Claude. File carried forward unchanged.` };
        console.log(`[standaloneCodeReview #${handoffId}] Slice ${i + 1}/${totalSlices} [${basename}]: approved as-is, skipping GPT-4o coding`);
      } else {
        coded = await codeSliceWithGPT4o(file, analysis);
        console.log(`[standaloneCodeReview #${handoffId}] Slice ${i + 1}/${totalSlices} [${basename}]: GPT-4o coded ${coded.content.length} chars`);
      }

      sliceResults.push({ path: file.path, claudeAnalysis: analysis, gptExplanation: coded.explanation });
      codedFiles.push({ path: file.path, content: coded.content, explanation: coded.explanation });

      allIssues.push(...analysis.issues.map(s => `[${basename}] ${s}`));
      allHipaaRisks.push(...analysis.hipaaRisks.map(s => `[${basename}] ${s}`));
      allFdaRisks.push(...analysis.fdaRisks.map(s => `[${basename}] ${s}`));
      allSafetyFlags.push(...analysis.safetyFlags.map(s => `[${basename}] ${s}`));
      allRecommendations.push(...analysis.recommendations.map(s => `[${basename}] ${s}`));

      // Save partial progress after each slice
      await db.update(agentHandoffs)
        .set({ articleSummary: buildProgressMsg(i, "done", i + 1) })
        .where(eq(agentHandoffs.id, handoffId));
    }

    // ── Save combined Step A result ────────────────────────────────────────
    const verdicts = sliceResults.map(s => s.claudeAnalysis.verdict);
    const criticalCount     = verdicts.filter(v => v === "critical_issues").length;
    const needsImprovCount  = verdicts.filter(v => v === "needs_improvement").length;
    const approvedCount     = verdicts.filter(v => v === "approve").length;

    const overallSummary = [
      `Per-slice Claude → GPT-4o review of ${group.groupName} (${totalSlices} files):`,
      approvedCount > 0     ? `${approvedCount} file(s) approved as-is` : "",
      needsImprovCount > 0  ? `${needsImprovCount} file(s) need improvement` : "",
      criticalCount > 0     ? `${criticalCount} file(s) have critical issues` : "",
      allIssues.length > 0  ? `${allIssues.length} total issue(s) found across all files` : "No issues found.",
    ].filter(Boolean).join(". ");

    const proposal: CodeProposal & { slices: PerSliceResult[] } = {
      files:   codedFiles,
      summary: overallSummary,
      concerns: [
        ...allHipaaRisks,
        ...allFdaRisks,
        ...allSafetyFlags,
      ],
      slices: sliceResults,
    };

    await db.update(agentHandoffs)
      .set({
        openaiCodeProposal: proposal as any,
        articleSummary: `Step A complete — ${totalSlices} slices: ${approvedCount} approved, ${needsImprovCount} improved, ${criticalCount} critical. Step B — Claude safety review in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B: Claude Safety Review (of combined coded output) ────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step B: Claude safety review on ${codedFiles.length} coded files`);
    const review = await runClaudeReview({
      codeProposal:   proposal,
      articleTitle:   reviewTitle,
      articleSummary: `Per-slice review of ${group.groupName}: ${overallSummary}`,
    });

    await db.update(agentHandoffs)
      .set({
        claudeCodeReview: review as any,
        articleSummary: `Step B complete (Claude verdict: ${review.overallVerdict}). Step B2 — Claude architecture/slice review in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B2: Claude Slice Review (architecture & coupling) ─────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step B2: Claude architecture/slice review`);
    const sliceReview = await runClaudeSliceReview({
      proposal,
      articleTitle: reviewTitle,
    });

    await db.update(agentHandoffs)
      .set({
        claudeSliceReview: sliceReview as any,
        articleSummary: `Step B2 complete (verdict: ${sliceReview.verdict}, confidence: ${sliceReview.confidenceScore}/100). Step C — GPT-4o final refiner in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    console.log(`[standaloneCodeReview #${handoffId}] Step B2: verdict=${sliceReview.verdict} confidence=${sliceReview.confidenceScore}/100`);

    // ── Step C: GPT-4o Final Refiner ──────────────────────────────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step C: GPT-4o final refiner`);
    const refined = await refineCodeProposal({
      original:     proposal,
      review,
      sliceReview,
      articleTitle: reviewTitle,
    });

    console.log(`[standaloneCodeReview #${handoffId}] Step C complete — ${refined.files.length} file(s), ${refined.additionalRecommendations?.length ?? 0} additional recs`);

    // ── Step D: Auto-implement GPT-4o's own additional recommendations ────
    let finalFiles  = refined.files;
    let stepDSkipped: string[] = [];

    if ((refined.additionalRecommendations?.length ?? 0) > 0) {
      console.log(`[standaloneCodeReview #${handoffId}] Step D: implementing ${refined.additionalRecommendations!.length} additional recommendations`);

      await db.update(agentHandoffs)
        .set({ articleSummary: `Step C complete (${refined.files.length} file(s)). Step D — auto-implementing ${refined.additionalRecommendations!.length} additional recommendation(s)…` })
        .where(eq(agentHandoffs.id, handoffId));

      const stepD = await implementAdditionalRecommendations({
        additionalRecommendations: refined.additionalRecommendations!,
        existingFiles:             refined.files,
        articleTitle:              reviewTitle,
      });

      stepDSkipped = stepD.skipped;

      if (stepD.files.length > 0) {
        const stepDPaths = new Set(stepD.files.map(f => f.path));
        const carried    = refined.files.filter(f => !stepDPaths.has(f.path));
        finalFiles = [...carried, ...stepD.files];
        console.log(`[standaloneCodeReview #${handoffId}] Step D merged — total ${finalFiles.length} file(s) (${stepD.files.length} from Step D)`);
      }
    }

    const finalRefined = {
      ...refined,
      files:                     finalFiles,
      additionalRecommendations: refined.additionalRecommendations ?? [],
      stepDSkipped,
      changesSummary: refined.additionalRecommendations?.length
        ? `${refined.changesSummary} Additionally, ${refined.additionalRecommendations.length} self-identified improvement(s) were auto-implemented in Step D.`
        : refined.changesSummary,
    };

    await db.update(agentHandoffs)
      .set({
        openaiRefinedCode: finalRefined as any,
        pipelineStatus:    "awaiting_approval",
        articleSummary:    `Review complete — ${totalSlices} slices reviewed, ${finalFiles.length} file(s) ready for approval. Claude found ${allIssues.length} issue(s) total.`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    console.log(`[standaloneCodeReview #${handoffId}] Complete — awaiting human approval`);

  } catch (err: any) {
    console.error(`[standaloneCodeReview #${handoffId}] Failed:`, err?.message);
    await db.update(agentHandoffs)
      .set({
        pipelineStatus: "failed",
        articleSummary: `Pipeline failed: ${err?.message ?? "unknown error"}`,
      })
      .where(eq(agentHandoffs.id, handoffId));
    throw err;
  }
}

// ── Backward-compatible wrapper ─────────────────────────────────────────────

export async function runStandaloneCodeReview(options?: {
  groupName?: string;
}): Promise<{ handoffId: number; groupName: string; status: string }> {
  const { handoffId, groupName } = await createCodeReviewHandoff(options);
  await runPipelineForHandoff(handoffId, options);
  return { handoffId, groupName, status: "awaiting_approval" };
}

export function getReviewGroups() {
  return HIGH_VALUE_FILE_GROUPS.map(g => ({
    groupName:  g.groupName,
    files:      g.files,
    sliceCount: g.files.length,
    filesFound: g.files.filter(fp => fs.existsSync(path.join(PROJECT_ROOT, fp))).length,
    filesTotal: g.files.length,
  }));
}
