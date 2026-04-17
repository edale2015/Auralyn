/**
 * server/tools/exportClaudeSlices.ts — Claude structured review slice exporter
 *
 * Packages code into 9 review-ready markdown slices + a zip archive for
 * structured Claude review of the Auralyn medical triage system.
 *
 * Safety features:
 *   - Allowlist blocks .env, credentials, node_modules, logs
 *   - secretScrubber redacts process.env.* and inline secrets
 *   - phiScrubber redacts SSN, DOB, MRN, phone numbers
 *   - diffTracker enables diff-only export (skip unchanged files)
 *   - Path traversal protection on all file reads
 *
 * Output:
 *   exports/claude-review/<timestamp>/
 *     01_system_overview.md … 09_fda_audit.md
 *     manifest.json
 *     REVIEW_PROMPTS.md
 *     claude-review-slices.zip
 */

import fs      from "fs";
import path    from "path";
import archiver from "archiver";

import { isAllowed }                             from "./allowlist";
import { scrubSecrets }                          from "./secretScrubber";
import { scrubPHI }                              from "./phiScrubber";
import { loadPreviousHashes, saveHashes, hasChanged, computeHash } from "./diffTracker";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SliceDef = {
  id:     string;
  title:  string;
  prompt: string;
  files:  string[];
};

export type ExportOptions = {
  diffOnly?:     boolean;  // only include files changed since last export
  scrubSecrets?: boolean;  // redact secrets (default true)
  scrubPHI?:     boolean;  // redact PHI patterns (default true)
};

export type ExportResult = {
  exportDir:    string;
  zipPath:      string;
  manifestPath: string;
  promptsPath:  string;
  sliceCount:   number;
  fileCount:    number;
  skippedCount: number;
};

// ── Slice definitions (adapted to actual Auralyn codebase paths) ──────────────

export const SLICE_DEFS: SliceDef[] = [
  {
    id:    "01_system_overview",
    title: "System Overview — Clinical Pipeline & Orchestration",
    prompt:
      "Review the top-level clinical pipeline and orchestration.\n" +
      "Focus on: architecture clarity, safety boundaries, module coupling,\n" +
      "and any place where a hallucination or logic gap could bypass clinical safeguards.\n" +
      "Critical rule: only the disposition/decision engine sets final clinical decisions.",
    files: [
      "server/clinical/finalPipeline.ts",
      "server/clinical/orchestrator.ts",
      "server/clinical/decisionOrchestrator.ts",
      "server/clinical/runFullClinicalFlow.ts",
    ],
  },
  {
    id:    "02_diagnosis_engine",
    title: "Diagnosis Engine — Bayesian + Fisher + Natural Gradient",
    prompt:
      "Review this diagnosis engine.\n" +
      "Focus on: mathematical correctness of posterior updates,\n" +
      "stability under missing or contradictory inputs,\n" +
      "Fisher information scaling, natural gradient step safety,\n" +
      "and failure modes that could bias toward low-risk diagnoses.",
    files: [
      "server/ai/fisher.ts",
      "server/ai/bayesianUpdater.ts",
      "server/ai/naturalGradient.ts",
      "server/clinical/bayesianEngine.ts",
      "server/clinical/bayesianPriorService.ts",
    ],
  },
  {
    id:    "03_disposition_safety",
    title: "Disposition & Safety Core (MOST CRITICAL)",
    prompt:
      "This is the core safety layer. It determines whether a patient is sent home vs escalated.\n" +
      "CRITICAL — review for:\n" +
      "  - Unsafe under-triage risk (patient sent home when they should be escalated)\n" +
      "  - Logic gaps in red flag detection\n" +
      "  - Conflicts between hallucination guards\n" +
      "  - Any code path where a dangerous case could incorrectly pass all gates\n" +
      "  - Race conditions between safety checks",
    files: [
      "server/clinical/finalDecisionEngine.ts",
      "server/clinical/safetyGate.ts",
      "server/clinical/safetyPipeline.ts",
      "server/clinical/safetyEscalationGuard.ts",
      "server/ai/hallucinationExtensions.ts",
    ],
  },
  {
    id:    "04_validation",
    title: "Validation Discipline — Golden Cases, Adversarial, Calibration",
    prompt:
      "Review this validation system.\n" +
      "Focus on:\n" +
      "  - Whether unsafe cases can slip through test coverage\n" +
      "  - Weaknesses in adversarial case generation\n" +
      "  - Missing failure scenarios (sepsis, PE, ACS, stroke edge cases)\n" +
      "  - Calibration flaws that could mask confidence errors\n" +
      "  - Whether the validation gate threshold is appropriately conservative",
    files: [
      "server/validation/goldenCaseHarness.ts",
      "server/validation/adversarialGenerator.ts",
      "server/validation/validationRunner.ts",
      "server/validation/validationGate.ts",
      "server/validation/calibrationMonitor.ts",
    ],
  },
  {
    id:    "05_control_tower",
    title: "Control Tower & Real-Time Streaming",
    prompt:
      "Review this real-time patient monitoring system.\n" +
      "Focus on:\n" +
      "  - Stale state and missed update scenarios\n" +
      "  - Race conditions in concurrent patient streams\n" +
      "  - Incorrect risk prioritization (low-risk patient getting ICU slot)\n" +
      "  - WebSocket auth and tenant isolation gaps\n" +
      "  - Dashboard data consistency under high load",
    files: [
      "server/realtime/patientStream.ts",
      "server/controlTower/validationDashboard.ts",
      "server/controlTower/calibrationService.ts",
      "server/controlTower/anomalyEngine.ts",
      "server/routes/controlTowerRoutes.ts",
      "server/routes/clinicalControlTowerRoutes.ts",
    ],
  },
  {
    id:    "06_simulation",
    title: "Digital Twin & Synthetic Case Generation",
    prompt:
      "Review this simulation and case generation layer.\n" +
      "Focus on:\n" +
      "  - Realism of generated patient cases\n" +
      "  - Adequate edge-case coverage (sepsis, shock, PE, ACS, stroke)\n" +
      "  - Biases in synthetic data that could hide validation gaps\n" +
      "  - Whether the digital twin accurately reflects real clinical deterioration\n" +
      "  - Failure to stress-test dangerous corner cases",
    files: [
      "server/simulation/digitalTwin.ts",
      "server/simulation/digitalTwinEngine.ts",
      "server/validation/fullCaseGenerator.ts",
      "server/simulation/clinicalScenarioGenerator.ts",
      "server/simulation/clinicalTrialSimulator.ts",
    ],
  },
  {
    id:    "07_clinical_rag",
    title: "Clinical RAG Copilot — KB-Grounded Answers",
    prompt:
      "This KB-grounded clinical answer system must NEVER influence final disposition.\n" +
      "Review for:\n" +
      "  - Any pathway where RAG output could leak into disposition decisions\n" +
      "  - False confidence signals from the uncertainty layer\n" +
      "  - Weak grounding logic (hallucinated citations or unsupported claims)\n" +
      "  - Missing physician review gate enforcement\n" +
      "  - Audit trail completeness for regulatory purposes",
    files: [
      "server/ai/clinicalRagGrounding.ts",
      "server/ai/uncertaintySignaling.ts",
      "server/routes/clinicalAnswerRoute.ts",
      "server/services/clinicalKnowledgeService.ts",
      "server/services/clinicalAnswerAuditService.ts",
      "server/services/physicianReviewGate.ts",
    ],
  },
  {
    id:    "08_rlhf",
    title: "RLHF & Safe Learning System",
    prompt:
      "Review this learning system.\n" +
      "Focus on:\n" +
      "  - Risk of unsafe drift in clinical weights over time\n" +
      "  - Whether the maxDeltaPct bound is sufficient to prevent dangerous updates\n" +
      "  - Evidence threshold adequacy (minEvidence = 5 — is this enough?)\n" +
      "  - Physician gating effectiveness\n" +
      "  - Whether rejected proposals correctly prevent future re-application\n" +
      "  - Weight update persistence and DB durability",
    files: [
      "server/rlhf/rlhfEngine.ts",
      "server/rlhf/trainer.ts",
      "server/rlhf/approval.ts",
      "server/rlhf/weightUpdater.ts",
    ],
  },
  {
    id:    "09_fda_audit",
    title: "FDA & Audit Layer — 21 CFR Part 11 / Part 820",
    prompt:
      "Review this audit and regulatory compliance layer.\n" +
      "Focus on:\n" +
      "  - Completeness of audit traceability (every clinical decision traceable)\n" +
      "  - SHA-256 chain tamper resistance\n" +
      "  - Missing required fields for 21 CFR Part 11 / Part 820 compliance\n" +
      "  - Whether the audit chain can be forged or gaps introduced\n" +
      "  - FDA De Novo submission readiness gaps",
    files: [
      "server/fda/auditChain.ts",
      "server/fda/justification.ts",
      "server/services/auditHashChain.ts",
      "server/services/auditReportService.ts",
      "server/services/fdaValidationService.ts",
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT        = process.cwd();
const EXPORT_ROOT = path.join(ROOT, "exports", "claude-review");

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readFileSafe(
  filePath: string,
  opts: Required<Pick<ExportOptions, "scrubSecrets" | "scrubPHI">>
): string {
  // Allowlist check
  if (!isAllowed(filePath)) {
    return `// BLOCKED BY ALLOWLIST: ${filePath}\n`;
  }

  // Path traversal protection — resolve and confirm within project root
  const abs  = path.resolve(ROOT, filePath);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    return `// PATH TRAVERSAL BLOCKED: ${filePath}\n`;
  }

  if (!fs.existsSync(abs)) {
    return `// FILE NOT FOUND: ${filePath}\n`;
  }

  let content = fs.readFileSync(abs, "utf8");
  if (opts.scrubSecrets) content = scrubSecrets(content);
  if (opts.scrubPHI)     content = scrubPHI(content);
  return content;
}

function writeSliceFile(
  sliceDir:    string,
  slice:       SliceDef,
  opts:        Required<ExportOptions>,
  prevHashes:  Record<string, string>,
  newHashes:   Record<string, string>,
): { included: number; skipped: number } {
  const scrubOpts = { scrubSecrets: opts.scrubSecrets, scrubPHI: opts.scrubPHI };
  const parts: string[] = [];
  let included = 0;
  let skipped  = 0;

  parts.push(`# ${slice.title}`);
  parts.push("");
  parts.push("## Review Prompt");
  parts.push("");
  parts.push(slice.prompt);
  parts.push("");
  parts.push("## Files");
  parts.push("");
  parts.push("---");
  parts.push("");

  parts.push("### Final Meta Question (ask after reviewing)");
  parts.push("");
  parts.push("List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.");
  parts.push("Be specific. Do not give generic advice. Focus on real-world clinical risk.");
  parts.push("");

  for (const file of slice.files) {
    const content = readFileSafe(file, scrubOpts);
    const hash    = computeHash(content);
    newHashes[file] = hash;

    if (opts.diffOnly && !hasChanged(file, content, prevHashes)) {
      parts.push(`### ${file}`);
      parts.push("");
      parts.push("*UNCHANGED — skipped in diff-only mode*");
      parts.push("");
      skipped++;
      continue;
    }

    const ext = path.extname(file).replace(".", "") || "txt";
    parts.push(`### ${file}${opts.diffOnly && prevHashes[file] ? " 🔥 CHANGED" : ""}`);
    parts.push("");
    parts.push("```" + ext);
    parts.push(content.trimEnd());
    parts.push("```");
    parts.push("");
    included++;
  }

  const outPath = path.join(sliceDir, `${slice.id}.md`);
  fs.writeFileSync(outPath, parts.join("\n"));
  return { included, skipped };
}

function writeManifest(exportDir: string, slices: SliceDef[], opts: Required<ExportOptions>): string {
  const manifest = {
    generatedAt:   new Date().toISOString(),
    root:          ROOT,
    exportOptions: opts,
    slices: slices.map(s => ({
      id:         s.id,
      title:      s.title,
      files:      s.files,
      outputFile: `${s.id}.md`,
    })),
  };
  const p = path.join(exportDir, "manifest.json");
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
  return p;
}

function writeReviewPrompts(exportDir: string, slices: SliceDef[]): string {
  const lines: string[] = [
    "# Claude Review Prompts — Auralyn Medical Triage System",
    "",
    "> Send each slice file to Claude **separately** for best results.",
    "> After each slice, ask: \"List the TOP 5 MOST DANGEROUS FAILURE MODES.\"",
    "",
  ];

  for (const s of slices) {
    lines.push(`## ${s.title}`);
    lines.push("");
    lines.push(`Use file: \`${s.id}.md\``);
    lines.push("");
    lines.push(s.prompt);
    lines.push("");
    lines.push(
      '> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. ' +
      'Be specific. Do not give generic advice. Focus on real-world clinical risk."'
    );
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Final Meta Prompt (send after all slices)");
  lines.push("");
  lines.push("You have reviewed all modules of a medical triage system. Now answer:");
  lines.push("1. Where can unsafe **under-triage** still occur?");
  lines.push("2. What is the **single most dangerous failure path**?");
  lines.push("3. Which module gives a **false sense of safety**?");
  lines.push("4. What should be **fixed first** before clinical deployment?");
  lines.push("");

  const p = path.join(exportDir, "REVIEW_PROMPTS.md");
  fs.writeFileSync(p, lines.join("\n"));
  return p;
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  ensureDir(path.dirname(zipPath));

  await new Promise<void>((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.once("close", () => resolve());
    archive.once("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportClaudeSlices(opts: ExportOptions = {}): Promise<ExportResult> {
  const resolved: Required<ExportOptions> = {
    diffOnly:     opts.diffOnly     ?? false,
    scrubSecrets: opts.scrubSecrets ?? true,
    scrubPHI:     opts.scrubPHI     ?? true,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportDir = path.join(EXPORT_ROOT, timestamp);
  ensureDir(exportDir);

  const prevHashes = resolved.diffOnly ? loadPreviousHashes() : {};
  const newHashes:  Record<string, string> = {};

  let totalIncluded = 0;
  let totalSkipped  = 0;

  for (const slice of SLICE_DEFS) {
    const { included, skipped } = writeSliceFile(
      exportDir, slice, resolved, prevHashes, newHashes
    );
    totalIncluded += included;
    totalSkipped  += skipped;
  }

  if (resolved.diffOnly) {
    saveHashes({ ...prevHashes, ...newHashes });
  }

  const manifestPath = writeManifest(exportDir, SLICE_DEFS, resolved);
  const promptsPath  = writeReviewPrompts(exportDir, SLICE_DEFS);
  const zipPath      = path.join(exportDir, "claude-review-slices.zip");

  await zipDirectory(exportDir, zipPath);

  return {
    exportDir,
    zipPath,
    manifestPath,
    promptsPath,
    sliceCount:   SLICE_DEFS.length,
    fileCount:    totalIncluded,
    skippedCount: totalSkipped,
  };
}
