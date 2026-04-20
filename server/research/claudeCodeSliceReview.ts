/**
 * server/research/claudeCodeSliceReview.ts
 * Step B2: Claude Slice-Based Architecture & Coupling Review
 *
 * AGENT RECOMMENDATION: This is the most valuable review pass in the pipeline.
 * It does something the safety review (Step B) cannot: it reads REAL slices of
 * the Auralyn codebase — the files being modified, their importers, and their
 * dependencies — and asks Claude specific technical/architecture questions about
 * the proposed change in context of the actual code.
 *
 * Key techniques:
 *   1. Import-aware slice loading: reads the proposed files + what they import
 *      + what imports them (blast-radius awareness)
 *   2. Specific question generation: Claude generates concrete questions it
 *      cannot answer from context alone (e.g. "Does callerX handle null return?")
 *      These open questions are flagged for human review.
 *   3. Confidence scoring: 0–100. Below 60 → auto-flag for mandatory human review.
 *   4. Coupling map: which other files will need changes if this is implemented.
 */

import * as fs   from "fs";
import * as path from "path";
import type { CodeProposal } from "./autoCodeProposalEngine";

// ── Types ──────────────────────────────────────────────────────────────────

export type ClaudeSliceReview = {
  architectureNotes:       string[];
  couplingRisks:           string[];
  interfaceRisks:          string[];
  specificRecommendations: string[];
  openQuestions:           string[];   // Questions Claude cannot answer from context alone
  blastRadius:             string[];   // Other files likely needing changes
  confidenceScore:         number;     // 0–100. <60 = mandatory human review
  verdict:                 "proceed" | "caution" | "hold";
};

// ── Import-aware codebase slice loader ─────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const MAX_FILE_CHARS = 2500;
const MAX_NEIGHBOR_FILES = 6;

/** Extract local import paths from TypeScript source */
function extractLocalImports(source: string, fromFile: string): string[] {
  const fromDir = path.dirname(fromFile);
  const results: string[] = [];
  const importRegex = /from\s+["'](\.[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) {
    const rel = m[1];
    // Try common extensions
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = path.resolve(PROJECT_ROOT, fromDir, rel + ext);
      const short = path.relative(PROJECT_ROOT, candidate);
      if (fs.existsSync(candidate) && !results.includes(short)) {
        results.push(short);
        break;
      }
    }
  }
  return results.slice(0, MAX_NEIGHBOR_FILES);
}

/** Find files that import a given target file (reverse dependency scan) */
function findImporters(targetShortPath: string, searchDirs = ["server", "client/src"]): string[] {
  const results: string[] = [];
  const targetBase = targetShortPath.replace(/\.tsx?$/, "").replace(/\\/g, "/");

  function scanDir(dir: string) {
    const abs = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(abs)) return;
    let entries: string[];
    try { entries = fs.readdirSync(abs); } catch { return; }

    for (const entry of entries) {
      const entryPath = path.join(abs, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(entryPath); } catch { continue; }

      if (stat.isDirectory()) {
        // Recurse but skip node_modules / .git / dist
        if (!["node_modules", ".git", "dist", ".next"].includes(entry)) {
          scanDir(path.join(dir, entry));
        }
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        const shortPath = path.relative(PROJECT_ROOT, entryPath);
        if (shortPath === targetShortPath) continue;
        try {
          const content = fs.readFileSync(entryPath, "utf-8").slice(0, 5000);
          if (content.includes(targetBase) || content.includes(path.basename(targetBase))) {
            results.push(shortPath);
            if (results.length >= 4) return; // Cap at 4 importers
          }
        } catch { continue; }
      }
    }
  }

  for (const dir of searchDirs) scanDir(dir);
  return results;
}

/** Load a file slice, returning empty string if not found */
function loadSlice(shortPath: string): string {
  const abs = path.join(PROJECT_ROOT, shortPath);
  if (!fs.existsSync(abs)) return "";
  try {
    return fs.readFileSync(abs, "utf-8").slice(0, MAX_FILE_CHARS);
  } catch {
    return "";
  }
}

interface SliceContext {
  proposed:   { path: string; content: string }[];
  imports:    { path: string; content: string }[];
  importedBy: { path: string; content: string }[];
}

/** Build rich context: proposed files + their imports + their importers */
function buildSliceContext(proposal: CodeProposal): SliceContext {
  const proposed: { path: string; content: string }[] = [];
  const importsMap = new Map<string, string>();
  const importedByMap = new Map<string, string>();

  for (const file of proposal.files) {
    const content = loadSlice(file.path);
    // Use the proposed content (what GPT-4o wants to write), but also note current content
    proposed.push({ path: file.path, content: file.content.slice(0, MAX_FILE_CHARS) });

    // Load what this file imports (from the CURRENT version on disk)
    const currentContent = content || file.content;
    const importPaths = extractLocalImports(currentContent, file.path);
    for (const imp of importPaths) {
      if (!importsMap.has(imp)) {
        const slice = loadSlice(imp);
        if (slice) importsMap.set(imp, slice);
      }
    }

    // Find files that import this file (callers)
    const callers = findImporters(file.path);
    for (const caller of callers) {
      if (!importedByMap.has(caller)) {
        const slice = loadSlice(caller);
        if (slice) importedByMap.set(caller, slice);
      }
    }
  }

  return {
    proposed,
    imports:    Array.from(importsMap.entries()).map(([p, c]) => ({ path: p, content: c })),
    importedBy: Array.from(importedByMap.entries()).map(([p, c]) => ({ path: p, content: c })),
  };
}

// ── Claude system prompt ────────────────────────────────────────────────────

const SLICE_REVIEW_SYSTEM = `You are a principal software architect reviewing code changes for Auralyn, a HIPAA-compliant FDA-regulated medical triage system. You are being given REAL slices of the codebase: the proposed new code, the files it imports, and the files that call it.

Your job is NOT safety review (a separate reviewer does that). Your job is:

1. ARCHITECTURE ANALYSIS: Does the change respect existing separation of concerns, layering, and patterns?
2. INTERFACE / CONTRACT ANALYSIS: Will callers (importedBy files) break? Are function signatures, types, and return shapes preserved?
3. COUPLING & BLAST RADIUS: Which other files will likely need changes as a consequence? Be specific.
4. SPECIFIC RECOMMENDATIONS: Concrete, line-level suggestions for making the code better.
5. OPEN QUESTIONS: Questions you CANNOT answer from the code slices alone that a human must verify (e.g. "Does the test suite cover the updated condition on line 42?").
6. CONFIDENCE SCORE: 0–100. Score based on: how well the change fits the existing architecture, how complete the type contracts are, how many open questions remain.
   - 90–100: Clean, low-risk, fits patterns perfectly
   - 70–89: Good with minor caveats
   - 50–69: Caution — meaningful architectural concerns
   - 0–49: Hold — significant rework needed

Verdict:
- "proceed" if confidenceScore >= 75 and no critical interface risks
- "caution" if confidenceScore 50–74 or interface risks present
- "hold" if confidenceScore < 50 or critical coupling breaks found

Return strict JSON only — no markdown fences:
{
  "architectureNotes": ["string"],
  "couplingRisks": ["string"],
  "interfaceRisks": ["string"],
  "specificRecommendations": ["string"],
  "openQuestions": ["string"],
  "blastRadius": ["filename: reason it needs updating"],
  "confidenceScore": number,
  "verdict": "proceed" | "caution" | "hold"
}`;

// ── Build the review prompt ─────────────────────────────────────────────────

function buildSlicePrompt(ctx: SliceContext, articleTitle: string, proposalSummary: string): string {
  const sections: string[] = [];

  sections.push(`Article driving this change: "${articleTitle}"`);
  sections.push(`What GPT-4o Architect proposed: ${proposalSummary}`);

  sections.push("\n=== PROPOSED NEW CODE (what will be written to disk) ===");
  for (const f of ctx.proposed) {
    sections.push(`FILE: ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``);
  }

  if (ctx.imports.length > 0) {
    sections.push("\n=== FILES THIS CODE IMPORTS (current disk versions — dependency context) ===");
    for (const f of ctx.imports) {
      sections.push(`FILE: ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``);
    }
  } else {
    sections.push("\n=== IMPORTS: No resolvable local imports found ===");
  }

  if (ctx.importedBy.length > 0) {
    sections.push("\n=== FILES THAT IMPORT THIS CODE (callers — blast-radius context) ===");
    for (const f of ctx.importedBy) {
      sections.push(`FILE: ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``);
    }
  } else {
    sections.push("\n=== CALLERS: No callers found in search paths ===");
  }

  sections.push("\nReview the proposed code in the context of its imports and callers. Be specific and concrete.");
  return sections.join("\n");
}

// ── Main function ───────────────────────────────────────────────────────────

export async function runClaudeSliceReview(args: {
  proposal:     CodeProposal;
  articleTitle: string;
}): Promise<ClaudeSliceReview> {
  const ctx = buildSliceContext(args.proposal);
  const prompt = buildSlicePrompt(ctx, args.articleTitle, args.proposal.summary);

  // ── Path 1: Real Claude (Anthropic API) ────────────────────────────────
  // Accept both ANTHROPIC_API_KEY and Anthropic_API_Key (Replit secret name variations)
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
  if (anthropicKey) {
    try {
      const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });

      const msg = await client.messages.create({
        model:      "claude-3-5-sonnet-20241022",
        max_tokens: 2500,
        system:     SLICE_REVIEW_SYSTEM,
        messages:   [{ role: "user", content: prompt }],
      });

      const raw = (msg.content[0] as any)?.text?.trim() ?? "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as ClaudeSliceReview;

      console.log(`[claudeSliceReview] Claude verdict: ${parsed.verdict} (confidence: ${parsed.confidenceScore})`);
      return parsed;
    } catch (err: any) {
      console.warn("[claudeSliceReview] Anthropic API failed, falling back to GPT-4o:", err?.message);
    }
  }

  // ── Path 2: GPT-4o with architect reviewer persona (fallback) ──────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return fallbackReview("No AI API key available (OPENAI_API_KEY or ANTHROPIC_API_KEY required)");
  }

  try {
    const OpenAI = require("openai").default ?? require("openai");
    const openai = new OpenAI({ apiKey: openaiKey });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SLICE_REVIEW_SYSTEM },
        { role: "user",   content: prompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as ClaudeSliceReview;

    console.log(`[claudeSliceReview] GPT-4o fallback verdict: ${parsed.verdict} (confidence: ${parsed.confidenceScore})`);
    return parsed;
  } catch (err: any) {
    return fallbackReview(err?.message ?? "unknown error");
  }
}

function fallbackReview(reason: string): ClaudeSliceReview {
  return {
    architectureNotes:       [`Slice review failed: ${reason}`],
    couplingRisks:           ["UNKNOWN — automated slice review failed, treat as high coupling risk"],
    interfaceRisks:          ["UNKNOWN — interface analysis unavailable"],
    specificRecommendations: ["Manual architecture review required before implementation"],
    openQuestions:           ["All questions must be manually verified — automated review failed"],
    blastRadius:             [],
    confidenceScore:         0,
    verdict:                 "hold",
  };
}
