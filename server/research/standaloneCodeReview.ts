/**
 * server/research/standaloneCodeReview.ts
 * Standalone App Code Review — no article required
 *
 * Reviews the current Auralyn codebase directly (not article-driven).
 * Picks the highest-value clinical/safety/FDA files, runs GPT-4o to propose
 * improvements, then passes both Claude review passes and lands in the
 * agent_handoffs queue, exactly like the article pipeline.
 *
 * Triggered by POST /api/research/app-code-review
 * Can also be called as part of the "Full Run" combined trigger.
 */

import * as fs   from "fs";
import * as path from "path";
import { db }                    from "../db";
import { agentHandoffs }         from "../../shared/schema";
import { runClaudeReview }       from "./claudeReviewAgent";
import { runClaudeSliceReview }  from "./claudeCodeSliceReview";
import { refineCodeProposal }    from "./openaiCodeRefiner";
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

const PROJECT_ROOT = process.cwd();
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

// ── Pick one group to review (rotate daily so different files get reviewed) ─

function pickReviewGroup(seed?: string): typeof HIGH_VALUE_FILE_GROUPS[0] {
  const dayIndex = seed
    ? 0
    : Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % HIGH_VALUE_FILE_GROUPS.length;
  return HIGH_VALUE_FILE_GROUPS[dayIndex];
}

// ── GPT-4o Proactive Code Review Architect ─────────────────────────────────

const PROACTIVE_ARCHITECT_SYSTEM = `You are a principal TypeScript engineer and clinical software architect reviewing Auralyn, a HIPAA-compliant FDA-regulated medical triage SaaS for NYC urgent care.

You are doing a PROACTIVE code review — not implementing an article's findings, but auditing existing code for:
1. HIPAA compliance gaps (PHI handling, audit logging, access control)
2. FDA SaMD compliance gaps (21 CFR Part 11, audit chain, algorithm validation annotations)
3. Clinical safety improvements (hallucination controls, safety gate hardening, threshold accuracy)
4. Software quality (type safety, error handling, null safety, performance)
5. Architectural improvements (separation of concerns, coupling, testability)

Focus on the most impactful, concrete improvements. Propose REAL code changes — full function bodies, not TODOs.

Return strict JSON:
{
  "files": [
    {
      "path": "server/path/to/file.ts",
      "content": "FULL improved file content",
      "explanation": "What was improved and why — 2-3 sentences"
    }
  ],
  "summary": "2-paragraph description of what this code review found and what the improvements address",
  "concerns": ["safety, HIPAA, or FDA concerns this change introduces that reviewers must check"]
}`;

async function generateProactiveProposal(
  group: typeof HIGH_VALUE_FILE_GROUPS[0],
  loadedFiles: Array<{ path: string; content: string }>
): Promise<CodeProposal> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for proactive code review");

  const fileSection = loadedFiles
    .map(f => `FILE: ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``)
    .join("\n\n");

  const userPrompt = `
Review Group: ${group.groupName}
Files being reviewed: ${loadedFiles.map(f => f.path).join(", ")}

${fileSection}

Identify the top improvements for these files and produce concrete TypeScript code changes.
Focus on HIPAA, FDA SaMD, clinical safety, and code quality in that priority order.
Only propose changes that are clearly improvements — do not change what is working well.
`.trim();

  const OpenAI = require("openai").default ?? require("openai");
  const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

  const resp = await openai.chat.completions.create({
    model:           "gpt-4o",
    max_tokens:      3500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROACTIVE_ARCHITECT_SYSTEM },
      { role: "user",   content: userPrompt },
    ],
  });

  const raw = resp.choices[0]?.message?.content?.trim() ?? "";
  const parsed = JSON.parse(raw) as CodeProposal;

  if (!Array.isArray(parsed.files) || !parsed.summary) {
    throw new Error("GPT-4o proactive review returned invalid structure");
  }

  return parsed;
}

// ── Step 1: Create handoff record synchronously (fast — DB only) ───────────
// Call this BEFORE responding to the HTTP request so the client gets the ID.

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

  const [handoff] = await db
    .insert(agentHandoffs)
    .values({
      articleId:      0,
      articleTitle:   reviewTitle,
      articleUrl:     "#app-code-review",
      articleSummary: `Reviewing ${group.groupName} — Step A: GPT-4o architect in progress…`,
      pipelineStatus: "running",
    })
    .returning();

  return { handoffId: handoff.id, groupName: group.groupName };
}

// ── Step 2: Run the full AI pipeline for an existing handoff record ──────────
// Call this fire-and-forget AFTER responding to the HTTP request.

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

  console.log(`[standaloneCodeReview #${handoffId}] Reviewing group: "${group.groupName}" | files: ${loadedFiles.map(f => f.path).join(", ")}`);

  try {
    // ── Step A: GPT-4o Proactive Architect ────────────────────────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step A: GPT-4o architecture review`);
    await db.update(agentHandoffs)
      .set({ articleSummary: `Step A — GPT-4o reviewing ${group.groupName} architecture…` })
      .where(eq(agentHandoffs.id, handoffId));

    const proposal = await generateProactiveProposal(group, loadedFiles);

    await db.update(agentHandoffs)
      .set({
        openaiCodeProposal: proposal as any,
        articleSummary: `Step A complete (${proposal.files.length} file proposals). Step B — Claude safety review in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B: Claude Safety Review ──────────────────────────────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step B: Claude safety review`);
    const review = await runClaudeReview({
      codeProposal:   proposal,
      articleTitle:   reviewTitle,
      articleSummary: `Proactive review of ${group.groupName}`,
    });

    await db.update(agentHandoffs)
      .set({
        claudeCodeReview: review as any,
        articleSummary: `Step B complete (Claude verdict: ${review.overallVerdict}). Step B2 — Claude architecture/slice review in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B2: Claude Slice Review ──────────────────────────────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step B2: Claude architecture/slice review`);
    const sliceReview = await runClaudeSliceReview({
      proposal,
      articleTitle: reviewTitle,
    });

    await db.update(agentHandoffs)
      .set({
        claudeSliceReview: sliceReview as any,
        articleSummary: `Step B2 complete (slice verdict: ${sliceReview.verdict}, confidence: ${sliceReview.confidenceScore}/100). Step C — GPT-4o refiner in progress…`,
      })
      .where(eq(agentHandoffs.id, handoffId));

    console.log(`[standaloneCodeReview #${handoffId}] Step B2: verdict=${sliceReview.verdict} confidence=${sliceReview.confidenceScore}/100`);

    // ── Step C: GPT-4o Refiner ────────────────────────────────────────────
    console.log(`[standaloneCodeReview #${handoffId}] Step C: GPT-4o refiner`);
    const refined = await refineCodeProposal({
      original:     proposal,
      review,
      sliceReview,
      articleTitle: reviewTitle,
    });

    await db.update(agentHandoffs)
      .set({
        openaiRefinedCode: refined as any,
        pipelineStatus:    "awaiting_approval",
        articleSummary:    `Review complete — ${refined.files.length} file(s) refined. Awaiting your approval.`,
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

/** Return the available review groups for the UI to display */
export function getReviewGroups() {
  return HIGH_VALUE_FILE_GROUPS.map(g => ({
    groupName: g.groupName,
    files: g.files,
    filesFound: g.files.filter(fp => fs.existsSync(path.join(PROJECT_ROOT, fp))).length,
    filesTotal: g.files.length,
  }));
}
