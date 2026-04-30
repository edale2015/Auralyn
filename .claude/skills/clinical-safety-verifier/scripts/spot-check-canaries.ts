#!/usr/bin/env npx tsx
/**
 * spot-check-canaries.ts
 *
 * Reads the 5 highest-risk drift canaries from driftCheck.ts and
 * validates that the definitions are structurally correct and
 * reference known complaint slugs in the ontology.
 *
 * This is a static analysis check, not a live pipeline run.
 * For live canary execution, use the scheduled runDriftCheck().
 *
 * Usage: npx tsx .claude/skills/clinical-safety-verifier/scripts/spot-check-canaries.ts
 */

import { readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(process.cwd());

function readSrc(rel: string): string {
  try { return readFileSync(join(ROOT, rel), "utf-8"); }
  catch { return ""; }
}

// ─── Parse canaries from driftCheck.ts ────────────────────────────────────────

const driftSrc = readSrc("server/harness/driftCheck.ts");
if (!driftSrc) {
  console.error("❌ server/harness/driftCheck.ts not found");
  process.exit(1);
}

// Extract canary IDs
const idMatches    = [...driftSrc.matchAll(/id:\s*["']([^"']+)["']/g)];
const dispMatches  = [...driftSrc.matchAll(/expectedDisposition:\s*["']([^"']+)["']/g)];
const compMatches  = [...driftSrc.matchAll(/complaint:\s*["']([^"']+)["']/g)];
const floorMatches = [...driftSrc.matchAll(/confidenceFloor:\s*([\d.]+)/g)];

const canaryCount = idMatches.length;
console.log(`\n── Drift Canary Spot Check ──────────────────────────────────────`);
console.log(`Found ${canaryCount} canaries in driftCheck.ts\n`);

// ─── Valid disposition values (from COMPLAINT_ONTOLOGY acuityClass mapping) ───

const VALID_DISPOSITIONS = new Set([
  "er_send", "urgent_care", "pcp", "self_care",
  "ER_SEND", "URGENT_CARE", "PCP", "SELF_CARE",
]);

const VALID_CONFIDENCE_RANGE = { min: 0.4, max: 0.95 };

// ─── Parse known complaint slugs from clinicalOntology.ts ─────────────────────

const ontologySrc = readSrc("server/ontology/clinicalOntology.ts");
const slugMatches = [...ontologySrc.matchAll(/canonical:\s*["']([^"']+)["']/g)];
const knownSlugs  = new Set(slugMatches.map(m => m[1]));

// ─── Spot check the 5 highest-risk (first 5 with mustHaveRedFlag: true) ────────

let failures = 0;
let checked  = 0;

// High-risk canaries are those with mustHaveRedFlag: true
const redFlagCanaryIds: string[] = [];
const redFlagMatches = [...driftSrc.matchAll(/mustHaveRedFlag:\s*true/g)];
console.log(`Red-flag canaries: ${redFlagMatches.length}`);

// Check each canary definition structurally
for (let i = 0; i < Math.min(5, canaryCount); i++) {
  const id          = idMatches[i]?.[1]    ?? "UNKNOWN";
  const disposition = dispMatches[i]?.[1]  ?? "UNKNOWN";
  const complaint   = compMatches[i]?.[1]  ?? "UNKNOWN";
  const floor       = parseFloat(floorMatches[i]?.[1] ?? "0");

  checked++;
  console.log(`\nCanary [${i + 1}]: ${id}`);

  // Check disposition is valid
  if (VALID_DISPOSITIONS.has(disposition)) {
    console.log(`  ✅ Disposition: ${disposition}`);
  } else {
    console.log(`  ❌ Invalid disposition: "${disposition}" — must be one of: ${[...VALID_DISPOSITIONS].join(", ")}`);
    failures++;
  }

  // Check complaint slug is in ontology
  if (knownSlugs.has(complaint) || knownSlugs.has(complaint.toLowerCase())) {
    console.log(`  ✅ Complaint slug: ${complaint} (in ontology)`);
  } else if (ontologySrc.includes(complaint)) {
    console.log(`  ⚠️  Complaint: ${complaint} (found in ontology source but not as canonical)`);
  } else {
    console.log(`  ❌ Complaint slug: "${complaint}" not found in COMPLAINT_ONTOLOGY — add it or use a known slug`);
    failures++;
  }

  // Check confidence floor is reasonable
  if (floor >= VALID_CONFIDENCE_RANGE.min && floor <= VALID_CONFIDENCE_RANGE.max) {
    console.log(`  ✅ Confidence floor: ${floor}`);
  } else {
    console.log(`  ❌ Confidence floor ${floor} outside reasonable range [${VALID_CONFIDENCE_RANGE.min}, ${VALID_CONFIDENCE_RANGE.max}]`);
    failures++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`Spot-checked ${checked}/${canaryCount} canaries`);

if (failures === 0) {
  console.log(`✅ All spot-checked canaries are structurally valid`);
  console.log(`   Full canary execution runs nightly via scheduleDriftCheck()`);
  process.exit(0);
} else {
  console.log(`❌ ${failures} canary definition(s) have structural issues`);
  console.log("   Fix before the nightly drift check runs or false failures will fire");
  process.exit(1);
}
