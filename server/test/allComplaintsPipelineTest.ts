/**
 * allComplaintsPipelineTest.ts
 *
 * Runs EVERY complaint in kb_master_rules through the 13-step pipeline with a
 * "moderately symptomatic" input set and a "negative / low-risk" input set.
 * Reports: did it complete? disposition? rules fired? any hard stops?
 *
 * Run:  npx tsx server/test/allComplaintsPipelineTest.ts
 *       npx tsx server/test/allComplaintsPipelineTest.ts --top   (first 20)
 *       npx tsx server/test/allComplaintsPipelineTest.ts --all   (all ~1,025)
 *
 * Also demonstrates how to derive test inputs automatically from the
 * question rules stored in the physician dialog database (kb_master_rules
 * where rule_type = 'question').
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { executePipeline } from "../clinical/ruleExecutionEngine";

// ── Colour helpers ─────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m", red:"\x1b[31m",
            green:"\x1b[32m", yellow:"\x1b[33m", cyan:"\x1b[36m" };
const b  = (s:string)=>C.bold+s+C.reset;
const r  = (s:string)=>C.red+s+C.reset;
const g  = (s:string)=>C.green+s+C.reset;
const y  = (s:string)=>C.yellow+s+C.reset;
const c  = (s:string)=>C.cyan+s+C.reset;
const d  = (s:string)=>C.dim+s+C.reset;

// ── Load all distinct complaints ──────────────────────────────────────────────
async function loadComplaints(orderByRules = false): Promise<string[]> {
  const query = orderByRules
    ? sql`SELECT complaint_id, COUNT(*) as cnt FROM kb_master_rules
          WHERE complaint_id IS NOT NULL
          GROUP BY complaint_id ORDER BY cnt DESC`
    : sql`SELECT DISTINCT complaint_id FROM kb_master_rules
          WHERE complaint_id IS NOT NULL ORDER BY complaint_id`;
  const { rows } = await db.execute(query);
  return (rows as any[]).map((row:any) => row.complaint_id as string).filter(Boolean);
}

// ── Load question rules for a complaint (the physician dialog database) ───────
//
// kb_master_rules WHERE rule_type = 'question' are the clarifying, secondary,
// and modifying questions for each complaint. Their question_dependencies field
// lists the input keys that a "yes" answer populates in the rule engine.
// This is how Auralyn knows WHICH questions to ask and WHAT each answer means.
interface QRule {
  rule_id:               string;
  rule_name:             string;
  logic_description:     string | null;
  question_dependencies: string[] | null;
  input_fields:          string | null;
  safety_level:          string | null;
  priority:              number | null;
}

async function loadQuestionRules(complaintId: string): Promise<QRule[]> {
  const { rows } = await db.execute(sql`
    SELECT rule_id, rule_name, logic_description, question_dependencies,
           input_fields, safety_level, priority
    FROM kb_master_rules
    WHERE complaint_id = ${complaintId}
      AND rule_type = 'question'
    ORDER BY priority ASC NULLS LAST
    LIMIT 50
  `);
  return rows as any[];
}

// ── Derive test inputs from question rules ────────────────────────────────────
//
// For each question rule, question_dependencies lists the fields that a "yes"
// answer would set. We build:
//   symptomatic — all dep fields true  (worst-case / high-acuity presentation)
//   low_risk    — all dep fields false (minimal / benign presentation)
function deriveInputs(
  rules: QRule[],
  scenario: "symptomatic" | "low_risk"
): Record<string, string | number | boolean> {
  const sym = scenario === "symptomatic";
  const inputs: Record<string, string | number | boolean> = {
    severity:        sym ? 8 : 2,
    ageYears:        sym ? 64 : 27,
    age:             sym ? 64 : 27,
    heart_age_45_64: sym,
    heart_age_ge_65: false,
    allergies:       "none",
    medications:     "none",
    onset:           sym ? "sudden" : "gradual",
  };

  for (const rule of rules) {
    const deps: string[] = Array.isArray(rule.question_dependencies)
      ? rule.question_dependencies
      : [];
    for (const dep of deps) {
      if (!dep || dep in inputs) continue;
      inputs[dep] = sym;
    }

    // Also pick up field names embedded in logic_description (answers.FIELD == 'yes')
    const desc = rule.logic_description ?? "";
    for (const m of desc.matchAll(/answers\.(\w+)/g)) {
      const f = m[1];
      if (f && !(f in inputs)) inputs[f] = sym;
    }
  }

  return inputs;
}

// ── Run one complaint + scenario ──────────────────────────────────────────────
interface RunResult {
  complaintId: string;
  scenario:    string;
  ok:          boolean;
  hardStop:    boolean;
  disposition: string;
  rules:       number;
  ms:          number;
  errMsg?:     string;
}

async function runOne(
  complaintId: string,
  inputs: Record<string, string | number | boolean>,
  scenario: string
): Promise<RunResult> {
  const t0 = Date.now();
  try {
    const res = await executePipeline(complaintId, inputs);
    return { complaintId, scenario, ok: true,
             hardStop: res.hardStop, disposition: res.finalDisposition ?? "none",
             rules: res.totalRulesFired, ms: Date.now() - t0 };
  } catch (e:any) {
    return { complaintId, scenario, ok: false,
             hardStop: false, disposition: "ERROR", rules: 0,
             ms: Date.now() - t0, errMsg: e?.message ?? String(e) };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + b("═".repeat(84)));
  console.log(b("  AURALYN — ALL-COMPLAINTS PIPELINE TEST"));
  console.log(b("  Physician Dialog Database → Auto-derived inputs → 13-step pipeline"));
  console.log(b("═".repeat(84)));

  const runAll = process.argv.includes("--all");
  const top20  = process.argv.includes("--top");
  // --top sorts by rule count DESC so the most-populated complaints come first
  const complaints = await loadComplaints(top20 || runAll);
  console.log(`\n  ${b(String(complaints.length))} complaints in kb_master_rules\n`);

  const limit  = runAll ? complaints.length : top20 ? 20 : 10;
  const subset = complaints.slice(0, limit);

  if (!runAll)
    console.log(d(`  (showing first ${limit} — pass --all for all ${complaints.length}, --top for top 20)\n`));

  const allResults: RunResult[] = [];

  for (const cid of subset) {
    const qRules = await loadQuestionRules(cid);
    const symInputs = deriveInputs(qRules, "symptomatic");
    const lowInputs = deriveInputs(qRules, "low_risk");

    const [sym, low] = await Promise.all([
      runOne(cid, symInputs, "symptomatic"),
      runOne(cid, lowInputs, "low_risk"),
    ]);

    allResults.push(sym, low);

    const symColor = sym.hardStop ? r : (sym.disposition.includes("URGENT") || sym.disposition.includes("ER")) ? y : g;
    const lowColor = !low.ok ? r : g;

    const symStr = symColor(`${sym.hardStop?"🔴":"🟠"} ${sym.disposition.padEnd(14)}`);
    const lowStr = low.ok ? lowColor(`🟢 ${low.disposition.padEnd(14)}`) : r("ERR");

    const qCount = `Q:${String(qRules.length).padStart(3)}`;
    const label  = cid.slice(0, 34).padEnd(34);
    const rFired = `${String(sym.rules).padStart(3)}/${String(low.rules).padStart(3)}`;

    console.log(`  ${c(label)} ${qCount}  SYM:${symStr}  LOW:${lowStr}  rules:${rFired}  ${d(sym.ms+"ms")}`);
    if (!sym.ok) console.log(r(`    ✗ SYM error: ${sym.errMsg}`));
    if (!low.ok) console.log(r(`    ✗ LOW error: ${low.errMsg}`));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total    = allResults.length;
  const errCt    = allResults.filter(x=>!x.ok).length;
  const hsCt     = allResults.filter(x=>x.hardStop).length;
  const avgMs    = Math.round(allResults.reduce((s,x)=>s+x.ms,0)/total);
  const passRate = ((total-errCt)/total*100).toFixed(1);

  console.log("\n\n" + b("═".repeat(84)));
  console.log(b("  SUMMARY"));
  console.log(b("═".repeat(84)));
  console.log(`\n  Complaints tested:    ${subset.length}`);
  console.log(`  Total pipeline runs:  ${total} (${subset.length} × 2 scenarios)`);
  console.log(`  Completed:            ${total-errCt === total ? g(String(total-errCt)) : r(String(total-errCt))} / ${total}`);
  console.log(`  Errors:               ${errCt > 0 ? r(String(errCt)) : g("0")}`);
  console.log(`  Hard stops (sympt.):  ${hsCt}`);
  console.log(`  Avg pipeline time:    ${avgMs}ms`);
  console.log(`  Pass rate:            ${total-errCt===total ? g(b(passRate+"%")) : y(b(passRate+"%"))}`);

  const failedCases = allResults.filter(x=>!x.ok);
  if (failedCases.length) {
    console.log(r(`\n  Failed runs:`));
    for (const f of failedCases)
      console.log(r(`    ✗ ${f.complaintId} [${f.scenario}]: ${f.errMsg}`));
  }

  // ── Physician Dialog DB walkthrough (first complaint as example) ───────────
  console.log("\n\n" + b("═".repeat(84)));
  console.log(b("  PHYSICIAN DIALOG DATABASE — HOW TESTING WORKS"));
  console.log(b("═".repeat(84)));
  const exCid = subset[0];
  if (exCid) {
    const qRules = await loadQuestionRules(exCid);
    console.log(`\n  Complaint: ${b(exCid)}`);
    console.log(`  ${b(String(qRules.length))} question rules in kb_master_rules for this complaint.\n`);
    console.log(`  Each row is one question the system can ask the patient:`);
    console.log(`  its question_dependencies field lists the input keys that`);
    console.log(`  a "yes" answer populates for the 13-step pipeline.\n`);
    for (const q of qRules.slice(0, 8)) {
      const deps = Array.isArray(q.question_dependencies) ? q.question_dependencies.join(", ") : "(none)";
      const desc = (q.logic_description ?? "—").slice(0, 65);
      console.log(`  ${b(q.rule_id.padEnd(28))} ${(q.safety_level ?? "–").padEnd(8)} pri:${String(q.priority ?? "–")}`);
      console.log(`    ${d("Question:")} ${desc}`);
      console.log(`    ${d("Sets:")}     ${deps}\n`);
    }
    if (qRules.length > 8) console.log(d(`  … +${qRules.length-8} more`));
  }

  console.log(`
  ${b("To extend this test to clarifying / secondary / modifying layers:")}
  ┌─────────────────────────────────────────────────────────────────────────────
  │  SELECT rule_id, rule_name, question_dependencies, safety_level, priority
  │  FROM kb_master_rules
  │  WHERE complaint_id = '<slug>'  AND  rule_type = 'question'
  │  ORDER BY priority ASC;
  │
  │  Priority 1-3   = Level 1 HPI (chief complaint characterisation)
  │  Priority 4-6   = Level 2 Secondary / associated symptoms
  │  Priority 7-10  = Level 3 Modifying, demographics, PMH
  └─────────────────────────────────────────────────────────────────────────────
  The auto-derived inputs above (symptomatic / low_risk) are built directly
  from question_dependencies — no hardcoding needed for any complaint.
`);

  console.log(total-errCt===total
    ? g(b("  ✅ All pipeline runs completed.\n"))
    : y(b(`  ⚠  ${errCt} error(s) — review above.\n`)));
}

main()
  .then(()=>process.exit(0))
  .catch(e=>{console.error(r("\nFATAL: "+e.message));console.error(e.stack);process.exit(1);});
