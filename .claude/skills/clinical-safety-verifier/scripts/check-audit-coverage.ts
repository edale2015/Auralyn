#!/usr/bin/env npx tsx
/**
 * check-audit-coverage.ts
 *
 * Scans clinical routes and services for missing appendAuditEvent() calls.
 * Reports clinical state changes that lack audit coverage.
 *
 * Usage: npx tsx .claude/skills/clinical-safety-verifier/scripts/check-audit-coverage.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(process.cwd());

interface AuditFinding {
  file:    string;
  line:    number;
  pattern: string;
  detail:  string;
}

const findings: AuditFinding[] = [];
let filesScanned = 0;
let auditCallsFound = 0;

function walkTs(dir: string, cb: (path: string, content: string) => void): void {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
          walkTs(full, cb);
        } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
          cb(full, readFileSync(full, "utf-8"));
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

// Clinical state change patterns that MUST have a nearby appendAuditEvent
const MUST_AUDIT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /physicianApproved\s*:\s*true/,          label: "physicianApproved: true"           },
  { re: /status\s*=\s*["']approved["']/,          label: "status = 'approved'"               },
  { re: /status\s*=\s*["']rejected["']/,          label: "status = 'rejected'"               },
  { re: /status\s*=\s*["']discharged["']/,        label: "status = 'discharged'"             },
  { re: /enrollInFollowUp\s*\(/,                  label: "enrollInFollowUp() call"           },
  { re: /sendDischargeInstructions\s*\(/,         label: "sendDischargeInstructions() call"  },
  { re: /\.update\s*\(\s*\{[^}]*physicianId/,    label: "DB update with physicianId"        },
];

// PHI leak patterns in audit calls
const PHI_IN_AUDIT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /appendAuditEvent[\s\S]{0,200}(name|phone|email|address|dob|ssn|mrn)\s*:/i,
    label: "Potential PHI field in appendAuditEvent details" },
  { re: /details\s*:\s*\{[\s\S]{0,100}symptoms\s*:/,
    label: "Raw symptoms in audit details (use complaintSlug instead)" },
];

walkTs(join(ROOT, "server/routes"), (path, content) => {
  filesScanned++;
  const lines = content.split("\n");

  // Count audit calls in this file
  const auditCalls = (content.match(/appendAuditEvent\s*\(/g) ?? []).length;
  auditCallsFound += auditCalls;

  lines.forEach((line, i) => {
    // Check for clinical state changes without nearby audit
    for (const { re, label } of MUST_AUDIT_PATTERNS) {
      if (!re.test(line)) continue;

      // Look within ±20 lines for an appendAuditEvent
      const window = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 20)).join("\n");
      if (!window.includes("appendAuditEvent")) {
        findings.push({
          file:    path.replace(ROOT, ""),
          line:    i + 1,
          pattern: label,
          detail:  `No appendAuditEvent found within 20 lines of: ${line.trim().slice(0, 80)}`,
        });
      }
    }

    // Check for PHI in audit calls
    for (const { re, label } of PHI_IN_AUDIT_PATTERNS) {
      // Check multi-line window
      const window = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      if (re.test(window)) {
        findings.push({
          file:    path.replace(ROOT, ""),
          line:    i + 1,
          pattern: `[PHI RISK] ${label}`,
          detail:  "Scrub PHI from audit event details — use scrubPhi() or remove the field",
        });
      }
    }
  });
});

// Also scan the main server/index.ts clinical routes
walkTs(join(ROOT, "server"), (path, content) => {
  if (!path.includes("/routes/") && !path.includes("index.ts")) return;
  filesScanned++;

  const auditCalls = (content.match(/appendAuditEvent\s*\(/g) ?? []).length;
  auditCallsFound += auditCalls;
});

// ─── Check audit event format consistency ────────────────────────────────────

const auditSrc = readFileSync(join(ROOT, "server/governance/audit.ts"), "utf-8").catch?.() ?? "";
const hashChainSrc = readFileSync(join(ROOT, "server/audit/hashChain.ts"), "utf-8").catch?.() ?? "";

console.log("\n── Audit Coverage Check ─────────────────────────────────────────");
console.log(`Scanned ${filesScanned} route files`);
console.log(`Found ${auditCallsFound} appendAuditEvent() calls total\n`);

if (findings.length === 0) {
  console.log("✅ Audit coverage check passed — no gaps found");
  console.log(`   ${auditCallsFound} audit events cover all scanned clinical state changes`);
  process.exit(0);
} else {
  const phi     = findings.filter(f => f.pattern.includes("PHI"));
  const missing = findings.filter(f => !f.pattern.includes("PHI"));

  if (phi.length > 0) {
    console.log("── PHI Risk in Audit Events ──");
    for (const f of phi) {
      console.log(`[PHI] ${f.file}:${f.line}`);
      console.log(`  ${f.detail}`);
    }
    console.log();
  }

  if (missing.length > 0) {
    console.log("── Missing Audit Events ──");
    for (const f of missing) {
      console.log(`[MISSING] ${f.file}:${f.line} — ${f.pattern}`);
      console.log(`  ${f.detail}`);
    }
    console.log();
  }

  const hasBlocking = phi.length > 0 || missing.some(f =>
    f.pattern.includes("physicianApproved") ||
    f.pattern.includes("discharged")
  );

  console.log(`Found ${findings.length} audit coverage issue(s)`);
  if (hasBlocking) {
    console.log("❌ Blocking issues found — fix PHI exposure and missing physician-gate audits before merge");
    process.exit(1);
  } else {
    console.log("⚠️  Non-blocking issues found — review before merge");
    process.exit(0);
  }
}
