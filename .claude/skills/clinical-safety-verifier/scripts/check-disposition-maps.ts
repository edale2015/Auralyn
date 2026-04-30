#!/usr/bin/env npx tsx
/**
 * check-disposition-maps.ts
 *
 * Scans the codebase for local DISPOSITION_MAP instances that should
 * be using OntologyFieldMapper instead.
 *
 * Usage: npx tsx .claude/skills/clinical-safety-verifier/scripts/check-disposition-maps.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(process.cwd());

interface Finding {
  file:    string;
  line:    number;
  snippet: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

const findings: Finding[] = [];

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
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

const EXEMPT_FILES = [
  "ontologyFieldMapper.ts",
  "clinicalOntology.ts",
  "check-disposition-maps.ts",
];

const PATTERNS: Array<{ re: RegExp; label: string; severity: Finding["severity"] }> = [
  {
    re:       /const\s+\w*[Dd]isposition[Mm]ap\s*[=:]/,
    label:    "Local DISPOSITION_MAP declaration",
    severity: "CRITICAL",
  },
  {
    re:       /disposition\s*===?\s*["'](er_send|urgent_care|pcp|self_care)["']/,
    label:    "Hardcoded disposition string comparison",
    severity: "HIGH",
  },
  {
    re:       /triage\.disposition(?!\s*=\s*OntologyFieldMapper)/,
    label:    "Raw triage.disposition access (not through OntologyFieldMapper)",
    severity: "MEDIUM",
  },
];

walkTs(join(ROOT, "server"), (path, content) => {
  const fileName = path.split("/").pop() ?? "";
  if (EXEMPT_FILES.some(e => fileName.includes(e))) return;

  const lines = content.split("\n");
  lines.forEach((line, i) => {
    for (const { re, label, severity } of PATTERNS) {
      if (re.test(line)) {
        findings.push({
          file:    path.replace(ROOT, ""),
          line:    i + 1,
          snippet: line.trim().slice(0, 100),
          severity,
        });
      }
    }
  });
});

walkTs(join(ROOT, "client/src"), (path, content) => {
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/const\s+\w*[Dd]isposition[Mm]ap\s*[=:]/.test(line)) {
      findings.push({
        file:     path.replace(ROOT, ""),
        line:     i + 1,
        snippet:  line.trim().slice(0, 100),
        severity: "CRITICAL",
      });
    }
    // Raw disposition string rendered in JSX
    if (/\{.*triage\.disposition.*\}/.test(line) && !/_ont/.test(line)) {
      findings.push({
        file:     path.replace(ROOT, ""),
        line:     i + 1,
        snippet:  line.trim().slice(0, 100),
        severity: "HIGH",
      });
    }
  });
});

console.log("\n── Disposition Map Drift Check ─────────────────────────────────");
console.log(`Scanned: ${ROOT}/server + client/src`);
console.log(`Exempt:  ${EXEMPT_FILES.join(", ")}\n`);

if (findings.length === 0) {
  console.log("✅ No DISPOSITION_MAP drift found — ontology layer is consistent.");
  process.exit(0);
} else {
  const critical = findings.filter(f => f.severity === "CRITICAL");
  const high     = findings.filter(f => f.severity === "HIGH");
  const medium   = findings.filter(f => f.severity === "MEDIUM");

  for (const group of [critical, high, medium]) {
    for (const f of group) {
      console.log(`[${f.severity}] ${f.file}:${f.line}`);
      console.log(`  ${f.snippet}`);
    }
  }

  console.log(`\n❌ ${findings.length} finding(s) — ${critical.length} critical, ${high.length} high, ${medium.length} medium`);

  if (critical.length > 0) {
    console.log("\nCritical findings must be fixed before merge.");
    console.log("Replace DISPOSITION_MAP with OntologyFieldMapper.enrichCaseDoc()");
    process.exit(1);
  } else {
    console.log("\nNo critical findings — review high/medium before merge.");
    process.exit(0);
  }
}
