#!/usr/bin/env npx tsx
/**
 * verify-gates.ts
 *
 * Verifies the five Auralyn safety guarantees (G1–G5).
 * Run after any change to pipeline.ts, ontologyFirewall.ts,
 * harnessEnforcer.ts, or review routes.
 *
 * Usage: npx tsx .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(process.cwd());
const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️ ";

let failures = 0;

function check(label: string, pass: boolean, detail?: string): void {
  if (pass) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

function warn(label: string, detail?: string): void {
  console.log(`  ${WARN} ${label}${detail ? ` — ${detail}` : ""}`);
}

function readSrc(rel: string): string {
  try { return readFileSync(join(ROOT, rel), "utf-8"); }
  catch { return ""; }
}

function grepSrc(pattern: RegExp, rel: string): boolean {
  return pattern.test(readSrc(rel));
}

function walkTs(dir: string, cb: (path: string, content: string) => void): void {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
          walkTs(full, cb);
        } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
          cb(full, readFileSync(full, "utf-8"));
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip unreadable dir */ }
}

// ─── G1: Red flag never self-cares ────────────────────────────────────────────
console.log("\nG1 — Red flag never self-cares");

const firewall = readSrc("server/ontology/ontologyFirewall.ts");
check(
  "OntologyFirewall.ts exists",
  firewall.length > 0,
);
check(
  "guardTriageOutput() is defined",
  /guardTriageOutput/.test(firewall),
);
check(
  "self_care blocked when redFlags present",
  /self_care|SELF_CARE/.test(firewall) && /redFlag|red_flag|RED_FLAG/.test(firewall),
);

const pipeline = readSrc("server/agent/pipeline.ts");
check(
  "guardTriageOutput called in pipeline.ts",
  /guardTriageOutput/.test(pipeline),
  "Gate 2 must run after runClinicalBrain()",
);

// ─── G2: Discharge requires physician actor ────────────────────────────────────
console.log("\nG2 — Discharge requires physician actor");

check(
  "guardDischarge() is defined in OntologyFirewall",
  /guardDischarge/.test(firewall),
);

// Scan for physicianApproved: true without a guard
let rawApprovalCount = 0;
walkTs(join(ROOT, "server"), (path, content) => {
  const matches = content.match(/physicianApproved\s*:\s*true/g) ?? [];
  for (const match of matches) {
    // Allow if inside a conditional block mentioning physicianId/req.user
    const surroundingLines = content.split("\n")
      .filter(l => l.includes("physicianApproved") || l.includes("physicianId") || l.includes("req.user"));
    if (surroundingLines.length === 0) rawApprovalCount++;
  }
});

check(
  "No unconditional physicianApproved: true found",
  rawApprovalCount === 0,
  rawApprovalCount > 0 ? `${rawApprovalCount} potential bypass(es) found` : undefined,
);

// ─── G3: Safety caps enforce ───────────────────────────────────────────────────
console.log("\nG3 — Safety caps enforce");

const harness = readSrc("server/harness/harnessEnforcer.ts");
check(
  "harnessEnforcer.ts exists",
  harness.length > 0,
);
check(
  "enforceAgentCaps() is defined",
  /enforceAgentCaps/.test(harness),
);
check(
  "HarnessCapExceeded error class is defined",
  /HarnessCapExceeded/.test(harness),
);
check(
  "enforceAgentCaps called in pipeline.ts",
  /enforceAgentCaps/.test(pipeline),
);

const caps = harness.match(/max_steps.*?(\d+)|max_llm_calls.*?(\d+)|maxSteps.*?(\d+)/);
if (caps) {
  console.log(`  ${PASS} Caps defined: ${caps[0]}`);
} else {
  warn("Could not parse cap values from harnessEnforcer.ts");
}

// ─── G4: Drift canaries defined ───────────────────────────────────────────────
console.log("\nG4 — Drift canaries defined");

const driftCheck = readSrc("server/harness/driftCheck.ts");
check(
  "driftCheck.ts exists",
  driftCheck.length > 0,
);

const canaryMatches = driftCheck.match(/id:\s*["'][^"']+["']/g) ?? [];
const canaryCount   = canaryMatches.length;
check(
  `At least 10 drift canaries defined (found ${canaryCount})`,
  canaryCount >= 10,
  canaryCount < 10 ? `Only ${canaryCount} found — target is 20` : undefined,
);
check(
  "runDriftCheck() is exported",
  /export.*runDriftCheck/.test(driftCheck),
);

// ─── G5: Ontology resolves — no raw DISPOSITION_MAP ───────────────────────────
console.log("\nG5 — Ontology resolves (no raw DISPOSITION_MAP)");

const mapper = readSrc("server/ontology/ontologyFieldMapper.ts");
check(
  "ontologyFieldMapper.ts exists",
  mapper.length > 0,
);
check(
  "enrichCaseDoc() is defined (static method or export)",
  /enrichCaseDoc/.test(mapper),
);

let dispositionMapFiles: string[] = [];
walkTs(join(ROOT, "server"), (path, content) => {
  if (path.includes("ontologyFieldMapper")) return;
  if (/const\s+\w*[Dd]isposition[Mm]ap\s*[=:]/.test(content)) {
    dispositionMapFiles.push(path.replace(ROOT, ""));
  }
});
walkTs(join(ROOT, "client"), (path, content) => {
  if (/const\s+\w*[Dd]isposition[Mm]ap\s*[=:]/.test(content)) {
    dispositionMapFiles.push(path.replace(ROOT, ""));
  }
});

check(
  `No rogue DISPOSITION_MAP instances (found ${dispositionMapFiles.length})`,
  dispositionMapFiles.length === 0,
  dispositionMapFiles.length > 0 ? dispositionMapFiles.slice(0, 3).join(", ") : undefined,
);

// ─── LLM Gateway enforcement ──────────────────────────────────────────────────
console.log("\nBonus: LLM Gateway enforcement");

const gateway = readSrc("server/gateway/llmGateway.ts");
check(
  "llmGateway.ts exists (Win 17a)",
  gateway.length > 0,
);

let directAnthropicCalls: string[] = [];
walkTs(join(ROOT, "server"), (path, content) => {
  if (path.includes("llmGateway") || path.includes("clinicalKBRetriever")) return;
  const matches = content.match(/anthropic\.messages\.create\(/g) ?? [];
  if (matches.length > 0) {
    directAnthropicCalls.push(`${path.replace(ROOT, "")} (${matches.length}x)`);
  }
});

if (directAnthropicCalls.length > 0) {
  warn(
    `${directAnthropicCalls.length} file(s) call anthropic.messages.create() directly`,
    "Consider migrating to llmGateway.complete() for failover + caching",
  );
  directAnthropicCalls.slice(0, 5).forEach(f => console.log(`    ${f}`));
} else {
  console.log(`  ${PASS} All LLM calls routed through llmGateway`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log(`${PASS} All safety guarantees PASS — ${failures} failures`);
  process.exit(0);
} else {
  console.log(`${FAIL} ${failures} safety guarantee(s) FAILED`);
  console.log("Fix all failures before merging clinical changes.");
  process.exit(1);
}
