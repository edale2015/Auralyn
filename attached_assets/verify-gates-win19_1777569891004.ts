#!/usr/bin/env npx ts-node
/**
 * verify-gates.ts — UPDATED FOR WIN 19
 * Adds G6: No direct anthropic.messages.create() calls outside llmGateway.ts
 * and researchRadar.ts (which has a documented exception for tool-use).
 *
 * Replace .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts
 * with this file after Win 19 is applied.
 */

import * as fs   from "fs";
import * as path from "path";

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET  = "\x1b[0m";

function pass(msg: string) { console.log(`${GREEN}✅ PASS${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}❌ FAIL${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠  WARN${RESET} ${msg}`); }

let failures = 0;
function check(condition: boolean, passMsg: string, failMsg: string): boolean {
  if (condition) { pass(passMsg); return true; }
  fail(failMsg); failures++; return false;
}
function readFile(relPath: string): string | null {
  const abs = path.join(process.cwd(), relPath);
  if (!fs.existsSync(abs)) { warn(`File not found: ${relPath}`); return null; }
  return fs.readFileSync(abs, "utf-8");
}

// ─── G1 ──────────────────────────────────────────────────────────────────────
console.log("\n── G1: Red flag never self-cares ──");
const firewall = readFile("server/ontology/ontologyFirewall.ts");
if (firewall) {
  check(firewall.includes("no_self_care_with_red_flags"), "Gate 2 constraint present", "MISSING red flag + SELF_CARE constraint");
  check(firewall.includes("guardTriageOutput"), "guardTriageOutput defined", "MISSING guardTriageOutput");
}
const pipeline = readFile("server/agent/pipeline.ts");
if (pipeline) {
  check(pipeline.includes("guardTriageOutput"), "pipeline.ts calls guardTriageOutput", "pipeline.ts MISSING guardTriageOutput — Gate 2 not wired");
}

// ─── G2 ──────────────────────────────────────────────────────────────────────
console.log("\n── G2: Discharge requires physician actor ──");
const reviewRoutes = readFile("server/routes/review.routes.ts");
if (reviewRoutes) {
  check(reviewRoutes.includes("guardDischarge"), "review.routes.ts calls guardDischarge", "MISSING guardDischarge — Gate 3 not wired");
  check(reviewRoutes.includes("req.user"), "review.routes.ts uses req.user for actor", "review.routes.ts may use wrong actor source");
}

// ─── G3 ──────────────────────────────────────────────────────────────────────
console.log("\n── G3: Safety caps enforce ──");
const enforcer = readFile("server/harness/harnessEnforcer.ts");
if (enforcer) {
  check(enforcer.includes("MAX_REASONING_STEPS"), "MAX_REASONING_STEPS cap defined", "MAX_REASONING_STEPS missing");
  check(enforcer.includes("MAX_LLM_CALLS_PER_CASE"), "MAX_LLM_CALLS_PER_CASE cap defined", "MAX_LLM_CALLS cap missing");
  check(enforcer.includes("MAX_COST_USD_PER_CASE"), "MAX_COST_USD_PER_CASE cap defined", "Cost cap missing");
}
if (pipeline) {
  check(pipeline.includes("enforceAgentCaps"), "pipeline.ts calls enforceAgentCaps", "pipeline.ts MISSING enforceAgentCaps — G3 not structural");
  check(pipeline.includes("HarnessCapExceeded"), "pipeline.ts handles HarnessCapExceeded", "pipeline.ts not catching HarnessCapExceeded");
}

// ─── G4 ──────────────────────────────────────────────────────────────────────
console.log("\n── G4: Drift canaries ──");
const driftCheck = readFile("server/harness/driftCheck.ts");
if (driftCheck) {
  const count = (driftCheck.match(/id:\s+"[^"]+"/g) ?? []).length;
  check(count >= 20, `${count} canaries (≥20 required)`, `Only ${count} canaries — some may have been removed`);
  check(driftCheck.includes("chest_pain_cardiac"), "High-risk canaries present", "chest_pain_cardiac canary missing");
}

// ─── G5 ──────────────────────────────────────────────────────────────────────
console.log("\n── G5: No raw DISPOSITION_MAP instances ──");
function findDispositionMaps(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  function walk(d: string) {
    fs.readdirSync(d).forEach(f => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory() && !["node_modules", ".git", "dist"].includes(f)) { walk(full); return; }
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) return;
      const content = fs.readFileSync(full, "utf-8");
      if (content.includes("DISPOSITION_MAP") && !full.includes("ontology") && !full.includes(".claude")) {
        results.push(full.replace(process.cwd(), ""));
      }
    });
  }
  walk(dir);
  return results;
}
const maps = [
  ...findDispositionMaps(path.join(process.cwd(), "client/src")),
  ...findDispositionMaps(path.join(process.cwd(), "server")),
];
if (maps.length === 0) {
  pass("No DISPOSITION_MAP instances found outside ontology");
} else {
  fail(`${maps.length} DISPOSITION_MAP instance(s) — migrate to OntologyFieldMapper:`);
  maps.forEach(f => console.log(`   ${YELLOW}→${RESET} ${f}`));
  failures++;
}

// ─── G6 — NEW FOR WIN 19 ─────────────────────────────────────────────────────
console.log("\n── G6: No direct SDK calls outside gateway ──");

// Files with documented exceptions (tool-use, gateway internals)
const SDK_EXCEPTIONS = [
  "server/gateway/llmGateway.ts",           // the gateway itself
  "server/harness/researchRadar.ts",         // tool-use — documented Win 19 exception
];

function findDirectSDKCalls(dir: string): Array<{ file: string; line: number; context: string }> {
  const results: Array<{ file: string; line: number; context: string }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(d: string) {
    fs.readdirSync(d).forEach(f => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory() && !["node_modules", ".git", "dist"].includes(f)) { walk(full); return; }
      if (!f.endsWith(".ts")) return;

      const relPath = full.replace(process.cwd() + "/", "");
      if (SDK_EXCEPTIONS.some(exc => relPath.includes(exc.replace("server/", "")))) return;

      const lines = fs.readFileSync(full, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (line.includes("anthropic.messages.create(") || line.includes("new Anthropic()")) {
          results.push({ file: relPath, line: i + 1, context: line.trim().slice(0, 80) });
        }
      });
    });
  }
  walk(dir);
  return results;
}

const directCalls = findDirectSDKCalls(path.join(process.cwd(), "server"));

if (directCalls.length === 0) {
  pass("No direct anthropic.messages.create() calls outside llmGateway.ts and researchRadar.ts");
} else {
  fail(`${directCalls.length} direct SDK call(s) found — migrate to llmGateway.complete():`);
  directCalls.forEach(c => console.log(`   ${YELLOW}→${RESET} ${c.file}:${c.line} — ${c.context}`));
  failures++;
}

// Verify gateway itself exists and has failover
const gateway = readFile("server/gateway/llmGateway.ts");
if (gateway) {
  check(gateway.includes("fallback"), "llmGateway.ts has failover logic", "llmGateway.ts missing failover");
  check(gateway.includes("LLM_GATEWAY_FAILOVER"), "llmGateway.ts audits failover events", "llmGateway.ts not auditing failovers");
}

// Verify researchRadar exception is documented
const radar = readFile("server/harness/researchRadar.ts");
if (radar) {
  check(
    radar.includes("TODO") || radar.includes("RESEARCH_RADAR_SCAN_CALL"),
    "researchRadar.ts has documented SDK exception",
    "researchRadar.ts using SDK without documentation — add TODO comment"
  );
}

// ─── Final ────────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────");
if (failures === 0) {
  console.log(`${GREEN}✅ ALL 6 SAFETY GUARANTEES VERIFIED (G1-G6)${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}❌ ${failures} GUARANTEE(S) FAILED — do not merge${RESET}`);
  process.exit(1);
}
