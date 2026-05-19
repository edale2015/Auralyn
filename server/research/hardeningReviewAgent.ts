/**
 * server/research/hardeningReviewAgent.ts
 *
 * Cross-slice hardening review agent.
 * Sends ALL 15 code review slices + ChatGPT's recommendations + ZIP patch bundle
 * + git diff + Drizzle schema to Claude using the exact prompt the user specified.
 *
 * Claude's job: integration review before coding, then a phased implementation plan.
 *
 * Pipeline:
 *   1. Read AURALYN_CODE_REVIEW_SLICES.md (the 15 slices)
 *   2. Read the hardening ZIP bundle (all patch/source files inside)
 *   3. Run git diff HEAD to capture any uncommitted changes
 *   4. Read shared/schema.ts (Drizzle schema — table definitions only)
 *   5. Capture route registrations from server/index.ts
 *   6. Accept ChatGPT recommendations as structured text
 *   7. Send everything to Claude with the hardening bundle prompt
 *   8. Return structured phase plan + file change list + remaining concerns
 */

import * as fs      from "fs";
import * as path    from "path";
import { execSync } from "child_process";
import Anthropic    from "@anthropic-ai/sdk";
import OpenAI       from "openai";
// adm-zip is a CommonJS module — use createRequire for safe ESM interop
// Fallback to "file:///" when import.meta.url is undefined (CJS production bundle)
import { createRequire } from "module";
const require = createRequire(import.meta.url ?? "file:///");
const AdmZip  = require("adm-zip");

const PROJECT_ROOT    = process.cwd();
const SLICES_FILE     = path.join(PROJECT_ROOT, "AURALYN_CODE_REVIEW_SLICES.md");
const SCHEMA_FILE     = path.join(PROJECT_ROOT, "shared/schema.ts");
const SERVER_INDEX    = path.join(PROJECT_ROOT, "server/index.ts");

// Directories searched for ZIP bundles (newest across both wins)
const ZIP_SEARCH_DIRS = [
  path.join(PROJECT_ROOT, "attached_assets", "hardening_bundles"),
  path.join(PROJECT_ROOT, "attached_assets"),
];

const MAX_SLICE_CHARS  = 100_000; // reduced to make room for ZIP + schema
const MAX_ZIP_CHARS    = 55_000;  // combined ZIP file contents
const MAX_SCHEMA_CHARS = 8_000;   // schema table definitions
const MAX_DIFF_CHARS   = 6_000;   // git diff output

// ── Find the newest ZIP bundle ────────────────────────────────────────────────
export function findNewestZip(): string | null {
  const candidates: Array<{ file: string; mtimeMs: number }> = [];

  for (const dir of ZIP_SEARCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".zip")) continue;
      const full = path.join(dir, name);
      try {
        candidates.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
      } catch { /* skip unreadable */ }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].file;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HardeningPhase {
  phase:       number;
  title:       string;
  description: string;
  filesChanged: string[];
  steps:       string[];
  risks:       string[];
  testsCover:  string[];
}

export interface HardeningReviewResult {
  integrationReview: {
    filesThatCopyDirectly:   string[];
    filesThatNeedMerge:      string[];
    missingImports:          string[];
    missingSchemaDefinitions: string[];
    routeRegistrationChanges: string[];
    likelyCompileErrors:     string[];
  };
  phases:             HardeningPhase[];
  filesChanged:       string[];
  manualMergeConflicts: string[];
  replitCommands:     string[];
  remainingConcerns: {
    clinical:  string[];
    hipaa:     string[];
    fda:       string[];
    security:  string[];
  };
  model:      string;
  durationMs: number;
  timestamp:  string;
}

// ── Hardening goals (from Slice 15 + user prompt) ────────────────────────────
export const CHATGPT_HARDENING_GOALS = `
CHATGPT HARDENING RECOMMENDATIONS — Highest-risk gaps from Slice 15:

1. AUDIT CHAIN PERSISTENCE
   Persist the SHA-256 hash chain across restarts using the existing auditLogs Postgres table.
   Current: in-memory only (500-entry cap, resets on restart).
   Required: on startup, read the last entry from DB to restore chainHead; on logEvent(), persist to DB.
   Risk: audit chain breaks on every deploy — HIPAA 21 CFR Part 11 violation.

2. AGENT BRAIN ROUTE HARDENING
   Harden /api/agent-brain/* routes with:
     - JWT auth middleware (currently unauthenticated)
     - Role check (physician or admin only)
     - CSRF token validation
     - Per-route rate limiting (start/stop loop: 5/min, cycle: 30/min)
     - Zod input validation on POST /cycle and /simulate

3. REPLACE localStorage BEARER TOKEN WITH HttpOnly COOKIE + CSRF
   Current: app_auth_token stored in localStorage — XSS-readable PHI exposure.
   Required:
     - Server sets token in HttpOnly + Secure + SameSite=Strict cookie on login
     - Server issues CSRF token (double-submit cookie pattern)
     - Remove localStorage.getItem('app_auth_token') from all frontend files
     - API client sends CSRF header, not Authorization Bearer from localStorage

4. AUTHENTICATE + PHI-MINIMIZE /ws/patient-stream
   Current: WebSocket broadcasts raw vitals (HR, SpO2, Temp, SBP, RR, name, patientId) to ALL connections.
   Required:
     - Validate JWT cookie/token on WebSocket upgrade handshake
     - Replace raw PHI payload with patientRef (hashed/tokenized ID) + riskLevel only
     - Physicians with active session may request full vitals via REST, not WebSocket

5. BRIDGE RULE-BASED brainOrchestrator WITH LLM FLEET SAFELY
   Current: brainOrchestrator (rule-based) and agentFleetOrchestrator (LLM) are separate systems.
   Required:
     - LLM fleet diagnosis output feeds INTO brainOrchestrator as a hint only
     - Rule-based risk score is authoritative — LLM CANNOT downgrade CRITICAL/HIGH to lower level
     - Safety gate sees BOTH scores; takes the maximum
     - Clear audit trail records which system set the final risk level

6. PERSIST AUTONOMOUS LOOP STATE
   Current: loop state in module-level variables — resets on server restart.
   Required:
     - On loop start/stop, write state to Postgres (or Redis)
     - On server startup, restore loop state (if was_running=true, restart loop)
     - recentResults and recentInsights: persist last 20 results to DB

7. FRONTEND API CLIENT + DASHBOARD COMPATIBILITY
   Required:
     - Remove all localStorage.getItem('app_auth_token') calls from queryClient.ts and correlation.ts
     - Add CSRF header injection (X-CSRF-Token from cookie or meta tag)
     - AgentBrainPage.tsx WebSocket: handle redacted patientRef payloads instead of full vitals
     - Show redacted state indicator when vitals are not available
`.trim();

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are reviewing and integrating a targeted hardening bundle for Auralyn, a HIPAA/FDA-sensitive medical triage SaaS.

You are being provided:
1. All 15 architecture/code review slices of the full Auralyn codebase.
2. The hardening ZIP bundle — actual source files and .diff patches produced by the hardening implementation.
3. The live git diff (HEAD uncommitted changes, if any).
4. The Drizzle schema (shared/schema.ts) — all database table definitions.
5. The route registration list (server/index.ts imports and app.use calls).
6. ChatGPT's hardening recommendations — a cross-slice hardening bundle focused on the highest-risk gaps from Slice 15.

Important:
- Do NOT blindly replace the whole app.
- Treat the 15 slices as architectural context.
- Treat the ZIP bundle as the proposed hardening implementation — review each file carefully.
- Treat the ChatGPT recommendations as the goals the ZIP is trying to achieve.
- Preserve existing working code unless the patch clearly improves security, auditability, auth, or PHI handling.
- This is clinical decision support, not autonomous medical care. Do not make the system independently authorize discharge, treatment, or routing without physician review gates.

The ZIP/patch is NOT a full rewrite of all 15 slices. It is a cross-slice hardening bundle focused on the highest-risk gaps from Slice 15. Do not rewrite the whole app.

Perform an integration review FIRST:
- Compare each ZIP file against the existing codebase slices.
- For each .diff patch file, identify where it applies and whether it applies cleanly.
- Identify which changes can be implemented directly (file can be copied as-is).
- Identify which changes need manual merge with existing code.
- Identify missing imports, missing Drizzle schema definitions, or route registration changes required.
- Check the schema (shared/schema.ts) for any missing tables or columns the ZIP assumes exist.
- Check server/index.ts route list for any route registrations the ZIP requires but that are missing.
- Identify any compile errors likely to occur.
- Then produce a phased implementation plan.

Return STRICT JSON only — no markdown fences, no prose before or after:
{
  "integrationReview": {
    "filesThatCopyDirectly":    ["path: reason it can be copied directly"],
    "filesThatNeedMerge":       ["path: what conflicts exist"],
    "missingImports":           ["file: missing import description"],
    "missingSchemaDefinitions": ["what Drizzle table/column needs to be added"],
    "routeRegistrationChanges": ["what needs to be added/changed in server/index.ts"],
    "likelyCompileErrors":      ["error description: file and line"]
  },
  "phases": [
    {
      "phase":        1,
      "title":        "Phase title",
      "description":  "What this phase accomplishes",
      "filesChanged": ["server/audit/hashChain.ts", "server/db.ts"],
      "steps":        ["Step 1: ...", "Step 2: ..."],
      "risks":        ["Risk: ..."],
      "testsCover":   ["Test: ..."]
    }
  ],
  "filesChanged":        ["complete list of all files modified across all phases"],
  "manualMergeConflicts": ["file: description of conflict"],
  "replitCommands":      ["commands to run in Replit after implementation"],
  "remainingConcerns": {
    "clinical":  ["clinical safety concern"],
    "hipaa":     ["HIPAA compliance gap"],
    "fda":       ["FDA SaMD gap"],
    "security":  ["security concern"]
  }
}`;

// ── Load slices ───────────────────────────────────────────────────────────────
function loadSlices(): string {
  if (!fs.existsSync(SLICES_FILE)) {
    return "[AURALYN_CODE_REVIEW_SLICES.md not found — generate it first by reading the codebase]";
  }
  const content = fs.readFileSync(SLICES_FILE, "utf-8");
  if (content.length > MAX_SLICE_CHARS) {
    return content.slice(0, MAX_SLICE_CHARS) + "\n\n[... truncated to fit context window ...]";
  }
  return content;
}

// ── Load ZIP bundle (auto-detects newest ZIP) ─────────────────────────────────
function loadZipContents(): string {
  const zipPath = findNewestZip();
  if (!zipPath) {
    return "[No ZIP bundle found — upload one via POST /api/hardening-review/webhook/upload-zip]";
  }
  try {
    const zip     = new AdmZip(zipPath);
    const entries = zip.getEntries() as Array<{ entryName: string; isDirectory: boolean; getData: () => Buffer }>;
    const parts: string[] = [];
    let totalChars = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name    = entry.entryName;
      const content = entry.getData().toString("utf-8");
      const block   = `\n--- FILE: ${name} ---\n${content}\n--- END: ${name} ---\n`;

      if (totalChars + block.length > MAX_ZIP_CHARS) {
        parts.push(`\n[... remaining ZIP files omitted — context limit reached ...]`);
        break;
      }
      parts.push(block);
      totalChars += block.length;
    }

    return parts.join("");
  } catch (err: any) {
    return `[Failed to read ZIP: ${err?.message}]`;
  }
}

// ── Load git diff ─────────────────────────────────────────────────────────────
function loadGitDiff(): string {
  try {
    // Exclude auto-generated metrics file from diff noise
    const diff = execSync(
      "git diff HEAD -- ':!data/runtime/metrics.json' ':!data/runtime/*.json'",
      { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 8000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (!diff) {
      // Fall back to showing the last commit's diff (most recent hardening work)
      const lastCommit = execSync(
        "git diff HEAD~1 HEAD -- ':!data/runtime/metrics.json' ':!data/runtime/*.json'",
        { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 8000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

      if (!lastCommit) return "[No uncommitted changes and no recent commit diff available]";
      const header = `[No uncommitted changes. Showing last commit diff (HEAD~1..HEAD)]\n\n`;
      const body   = lastCommit.length > MAX_DIFF_CHARS
        ? lastCommit.slice(0, MAX_DIFF_CHARS) + "\n\n[... diff truncated ...]"
        : lastCommit;
      return header + body;
    }

    return diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[... diff truncated ...]"
      : diff;
  } catch (err: any) {
    return `[git diff failed: ${err?.message}]`;
  }
}

// ── Load Drizzle schema ───────────────────────────────────────────────────────
function loadSchema(): string {
  if (!fs.existsSync(SCHEMA_FILE)) {
    return "[shared/schema.ts not found]";
  }
  const content = fs.readFileSync(SCHEMA_FILE, "utf-8");
  if (content.length <= MAX_SCHEMA_CHARS) return content;
  // Truncate but try to end at a clean pgTable boundary
  const truncated = content.slice(0, MAX_SCHEMA_CHARS);
  const lastTable = truncated.lastIndexOf("export const ");
  return (lastTable > MAX_SCHEMA_CHARS * 0.8 ? truncated.slice(0, lastTable) : truncated)
    + "\n\n[... schema truncated — remaining table definitions omitted ...]";
}

// ── Load route registrations ──────────────────────────────────────────────────
function loadRouteList(): string {
  if (!fs.existsSync(SERVER_INDEX)) {
    return "[server/index.ts not found]";
  }
  const lines  = fs.readFileSync(SERVER_INDEX, "utf-8").split("\n");
  const routes = lines.filter(l =>
    l.includes("app.use") || l.includes("registerRoutes") || l.includes("Router") ||
    l.includes("import {") || l.includes("import ")
  ).slice(0, 80); // capture imports + use() calls
  return routes.join("\n");
}

// ── Claude API ────────────────────────────────────────────────────────────────
function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function getOpenAI(): OpenAI | null {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

// ── Build user message ────────────────────────────────────────────────────────
function buildUserMessage(opts: {
  slices:           string;
  zipContents:      string;
  gitDiff:          string;
  schema:           string;
  routeList:        string;
  gptRecommendations: string;
}): string {
  return `=== AURALYN CODEBASE — ALL 15 ARCHITECTURE/CODE REVIEW SLICES ===

${opts.slices}

=== END OF SLICES ===

=== HARDENING ZIP BUNDLE — ALL SOURCE FILES AND PATCHES ===

${opts.zipContents}

=== END OF ZIP BUNDLE ===

=== LIVE GIT DIFF (HEAD) ===

${opts.gitDiff}

=== END OF GIT DIFF ===

=== DRIZZLE SCHEMA (shared/schema.ts) ===

${opts.schema}

=== END OF DRIZZLE SCHEMA ===

=== ROUTE REGISTRATIONS (server/index.ts — imports + app.use) ===

${opts.routeList}

=== END OF ROUTE REGISTRATIONS ===

=== CHATGPT HARDENING RECOMMENDATIONS ===

${opts.gptRecommendations}

=== END OF CHATGPT RECOMMENDATIONS ===

Now perform the integration review (comparing the ZIP bundle against the existing slices and schema), then produce the phased implementation plan as described in your instructions. Return strict JSON only.`;
}

// ── Parse / validate result ───────────────────────────────────────────────────
function parseResult(raw: string): HardeningReviewResult | null {
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned) as HardeningReviewResult;
  } catch {
    return null;
  }
}

// ── Main function ─────────────────────────────────────────────────────────────
export async function runHardeningReview(options: {
  gptRecommendations?: string;
  onProgress?:         (msg: string) => void;
}): Promise<HardeningReviewResult> {
  const start   = Date.now();
  const gptRecs = options.gptRecommendations ?? CHATGPT_HARDENING_GOALS;
  const log     = options.onProgress ?? (() => {});

  log("Loading 15 architecture slices…");
  const slices = loadSlices();
  log(`Slices loaded: ${slices.length.toLocaleString()} chars`);

  const activeZip = findNewestZip();
  log(`Reading hardening ZIP bundle: ${activeZip ? path.basename(activeZip) : "none found"}…`);
  const zipContents = loadZipContents();
  log(`ZIP bundle loaded: ${zipContents.length.toLocaleString()} chars`);

  log("Running git diff HEAD…");
  const gitDiff = loadGitDiff();
  log(`Git diff: ${gitDiff.length.toLocaleString()} chars`);

  log("Loading Drizzle schema (shared/schema.ts)…");
  const schema = loadSchema();
  log(`Schema loaded: ${schema.length.toLocaleString()} chars`);

  log("Loading route registrations (server/index.ts)…");
  const routeList = loadRouteList();
  log(`Route list: ${routeList.length.toLocaleString()} chars`);

  const totalChars = slices.length + zipContents.length + gitDiff.length + schema.length + routeList.length;
  log(`Total context assembled: ${totalChars.toLocaleString()} chars — sending to Claude…`);

  const userMessage = buildUserMessage({ slices, zipContents, gitDiff, schema, routeList, gptRecommendations: gptRecs });

  // ── Path 1: Claude (preferred — most accurate for architecture review) ──────
  const claude = getAnthropic();
  if (claude) {
    log("Sending to Claude for integration review + phased plan…");
    try {
      const msg = await claude.messages.create({
        model:      "claude-opus-4-5",
        max_tokens: 8096,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }],
      });

      const raw    = (msg.content[0] as any)?.text?.trim() ?? "";
      const parsed = parseResult(raw);

      if (!parsed || !Array.isArray(parsed.phases)) {
        throw new Error("Claude returned invalid JSON structure");
      }

      log(`Claude review complete — ${parsed.phases.length} phases planned`);
      return {
        ...parsed,
        model:      "claude-opus-4-5",
        durationMs: Date.now() - start,
        timestamp:  new Date().toISOString(),
      };
    } catch (err: any) {
      log(`Claude failed: ${err?.message} — falling back to GPT-4o`);
    }
  }

  // ── Path 2: GPT-4o fallback ───────────────────────────────────────────────
  const openai = getOpenAI();
  if (!openai) {
    throw new Error("No AI API key available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
  }

  log("Sending to GPT-4o (Claude unavailable)…");

  const resp = await openai.chat.completions.create({
    model:           "gpt-4o",
    max_tokens:      8096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userMessage.slice(0, 80_000) }, // GPT-4o 128K context
    ],
  });

  const raw    = resp.choices[0]?.message?.content?.trim() ?? "";
  const parsed = parseResult(raw);

  if (!parsed || !Array.isArray(parsed.phases)) {
    throw new Error("GPT-4o returned invalid JSON structure");
  }

  log(`GPT-4o review complete — ${parsed.phases.length} phases planned`);
  return {
    ...parsed,
    model:      "gpt-4o-fallback",
    durationMs: Date.now() - start,
    timestamp:  new Date().toISOString(),
  };
}

// ── Quick summary formatter ───────────────────────────────────────────────────
export function summariseResult(r: HardeningReviewResult): string {
  const lines: string[] = [
    `Model: ${r.model} | Duration: ${(r.durationMs / 1000).toFixed(1)}s`,
    `Phases: ${r.phases.length} | Files changed: ${r.filesChanged?.length ?? "?"}`,
    `Merge conflicts: ${r.manualMergeConflicts?.length ?? 0}`,
    `Remaining concerns: clinical(${r.remainingConcerns?.clinical?.length ?? 0}) HIPAA(${r.remainingConcerns?.hipaa?.length ?? 0}) FDA(${r.remainingConcerns?.fda?.length ?? 0}) security(${r.remainingConcerns?.security?.length ?? 0})`,
  ];
  return lines.join(" | ");
}
