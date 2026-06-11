/**
 * coverageSweep.ts — T028 / V029
 *
 * Honest per-complaint coverage map for the Auralyn complaint pipeline.
 * TEST ONLY. This script never edits KB data, question configs, or pipeline
 * logic — it drives the LIVE lab endpoints on the running dev server and records
 * what actually happens.
 *
 * Scope boundary: this sweep exercises the LAB engine path
 * (POST /api/complaint-test-lab/narrative-run), which takes all inputs at once.
 * It proves engine + KB breadth. It does NOT exercise the live turn-by-turn
 * WhatsApp/conversation path — that is V030 (turnByTurnRobustness.ts).
 *
 * Usage:
 *   npx tsx server/tests/coverageSweep.ts --limit 25   # smoke run
 *   npx tsx server/tests/coverageSweep.ts              # full sweep (resumable)
 *
 * Output: test-reports/coverage-1025.csv  (append-checkpointed, resumable)
 *
 * Classification (exactly four buckets, mutually exclusive):
 *   NO_DATA  — static dx_count==0 OR question_count==0 (content gap). No live run.
 *   BROKEN   — transport error / pipeline error / escalates to ER without running.
 *   FULL     — pipeline fired a differential AND produced a genuine disposition
 *              (a disposition rule fired, or a red-flag escalation set one).
 *   PARTIAL  — pipeline ran but is missing one of the two (records last stage).
 *
 * NOTE ON DISPOSITION: the rule engine defaults finalDisposition to "HOME_CARE"
 * whenever no disposition rule fires and no escalation occurs. That default is
 * NOT counted as a produced disposition here — only a rule-fired or escalation
 * disposition counts as genuine. This is deliberate so the map tells the truth
 * about the disposition stage rather than crediting the fallback.
 */

import * as fs from "fs";
import * as path from "path";

const BASE = process.env.LAB_BASE ?? "http://localhost:5000";
const OUT_DIR = path.resolve(process.cwd(), "test-reports");
const OUT_CSV = path.join(OUT_DIR, "coverage-1025.csv");

const HEADER =
  "complaint_id,detected_complaint,complaint_confidence,prefill_pct,l1_q,l2_q,l3_q,dx_count,disposition_present,last_stage,classification,reason";

// Step number -> human name (mirrors PIPELINE_STEPS in ruleExecutionEngine.ts)
const STEP_NAMES: Record<number, string> = {
  1: "complaint_id",
  2: "differential",
  3: "modifier",
  4: "question_engine",
  5: "workup",
  6: "medication",
  7: "red_flag_screen",
  8: "cluster_scoring",
  9: "diagnosis_ranking",
  10: "disposition",
  11: "plan",
  12: "output_summary",
  13: "audit",
};

// gpt-4o-mini estimate (endpoint exposes no token usage). ~600 in + ~800 out.
// $0.15/1M in + $0.60/1M out -> ~$0.00057 per narrative-intake call.
const PER_CALL_USD = 0.0006;

// ── CSV-safe field: no commas, no newlines (verification uses `cut -d,`) ───────
function csv(v: unknown): string {
  return String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/,/g, ";")
    .trim();
}

function humanize(id: string): string {
  return id.replace(/_/g, " ").trim();
}

// Bland, moderate narrative: gives duration/severity/timing to trigger the
// pipeline WITHOUT injecting red-flag symptoms that would force an escalation.
// Deterministic per complaint id (so re-runs are identical).
function narrativeFor(id: string): string {
  const c = humanize(id);
  return `I have been dealing with ${c} for about 3 days now. It comes and goes through the day and feels moderate, maybe a 5 out of 10. I do not have any other major symptoms that I have noticed. I would like to get it checked out.`;
}

interface SummaryRow {
  complaint_id: string;
  dx_count: number;
  question_count: number;
  disp_count: number;
}

async function fetchMasterList(): Promise<SummaryRow[]> {
  const res = await fetch(`${BASE}/api/complaint-test-lab/diff-disposition/summary`);
  if (!res.ok) throw new Error(`summary endpoint HTTP ${res.status}`);
  const body = (await res.json()) as any;
  if (!body?.ok || !Array.isArray(body.complaints)) {
    throw new Error("summary endpoint returned unexpected shape");
  }
  return body.complaints.map((c: any) => ({
    complaint_id: c.complaint_id,
    dx_count: Number(c.dx_count ?? 0),
    question_count: Number(c.question_count ?? 0),
    disp_count: Number(c.disp_count ?? 0),
  }));
}

interface RowOut {
  complaint_id: string;
  detected_complaint: string;
  complaint_confidence: string;
  prefill_pct: string;
  l1_q: string;
  l2_q: string;
  l3_q: string;
  dx_count: string;
  disposition_present: string;
  last_stage: string;
  classification: string;
  reason: string;
}

function toLine(r: RowOut): string {
  return [
    csv(r.complaint_id),
    csv(r.detected_complaint),
    csv(r.complaint_confidence),
    csv(r.prefill_pct),
    csv(r.l1_q),
    csv(r.l2_q),
    csv(r.l3_q),
    csv(r.dx_count),
    csv(r.disposition_present),
    csv(r.last_stage),
    csv(r.classification),
    csv(r.reason),
  ].join(",");
}

async function postNarrativeRun(id: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${BASE}/api/complaint-test-lab/narrative-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative: narrativeFor(id), complaintId: id }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`non-JSON response HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${csv(body?.error ?? text.slice(0, 120))}`);
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

function classifyRunnable(s: SummaryRow, body: any): RowOut {
  const ex = body?.extraction ?? {};
  const pr = body?.pipelineResult ?? {};
  const steps: any[] = Array.isArray(pr.steps) ? pr.steps : [];

  // Soft detection metric: suggestedComplaints[0] holds GPT's raw pass-1
  // detection even when a hint forces detectedComplaint to the requested id.
  const sugg0 = Array.isArray(ex.suggestedComplaints) ? ex.suggestedComplaints[0] : null;
  const detected = sugg0?.id ?? ex.detectedComplaint ?? "";
  const conf = sugg0?.confidence ?? ex.complaintConfidence ?? "";

  // Remaining (unanswered) questions per level.
  const rem: any[] = Array.isArray(ex.remainingQuestions) ? ex.remainingQuestions : [];
  const l1 = rem.filter((q) => q.level === 1).length;
  const l2 = rem.filter((q) => q.level === 2).length;
  const l3 = rem.filter((q) => q.level === 3).length;

  // Differential: count diagnosis rules actually fired (steps 2 & 9).
  // (summary.topDiagnoses is unreliable — extractTopDiagnoses reads the wrong
  //  field name, so compute from steps directly.)
  let dxFired = 0;
  for (const st of steps) {
    if (st.ruleType === "diagnosis") {
      dxFired = Math.max(dxFired, Array.isArray(st.rulesFired) ? st.rulesFired.length : 0);
    }
  }
  const differentialPresent = dxFired > 0;

  // Genuine disposition: a disposition rule fired (step 10) OR an escalation set it.
  const step10 = steps.find((st) => st.step === 10);
  const dispRuleFired = step10 && Array.isArray(step10.rulesFired) ? step10.rulesFired.length > 0 : false;
  const crit = Array.isArray(pr.criticalFlagsHit) ? pr.criticalFlagsHit.length : 0;
  const hardStop = pr.hardStop === true || body?.summary?.hardStop === true;
  const escalated = crit > 0 || hardStop;
  const genuineDisp = dispRuleFired || escalated;

  const finalDisp = body?.summary?.disposition ?? pr.finalDisposition ?? "UNKNOWN";
  const totalFired = Number(pr.totalRulesFired ?? 0);

  // Last stage that actually fired a rule.
  const firedStepNums = steps
    .filter((st) => Array.isArray(st.rulesFired) && st.rulesFired.length > 0)
    .map((st) => st.step);
  const lastNum = firedStepNums.length ? Math.max(...firedStepNums) : 0;
  const lastStage = lastNum ? `${lastNum}:${STEP_NAMES[lastNum] ?? "step" + lastNum}` : "none";

  const base = {
    complaint_id: s.complaint_id,
    detected_complaint: detected,
    complaint_confidence: typeof conf === "number" ? conf.toFixed(2) : String(conf),
    prefill_pct: String(ex.prefilledPercent ?? 0),
    l1_q: String(l1),
    l2_q: String(l2),
    l3_q: String(l3),
    dx_count: String(s.dx_count),
  };

  // Pipeline-level error reported by the route (non-escalation throw).
  if (body?.error) {
    return { ...base, disposition_present: "false", last_stage: lastStage, classification: "BROKEN", reason: `pipeline error: ${body.error}` };
  }

  // Escalated to ER but produced nothing -> ER instead of running.
  if (escalated && !differentialPresent && totalFired === 0) {
    return { ...base, disposition_present: "true", last_stage: lastStage, classification: "BROKEN", reason: `escalated (${finalDisp}) with no pipeline execution` };
  }

  if (differentialPresent && genuineDisp) {
    return {
      ...base,
      disposition_present: "true",
      last_stage: lastStage,
      classification: "FULL",
      reason: `differential (${dxFired} dx) + disposition ${finalDisp}${escalated ? " via escalation" : ""}`,
    };
  }

  // PARTIAL — record what is missing and how far it got.
  let reason: string;
  if (!differentialPresent && !genuineDisp) {
    reason = `no differential (0 diagnosis rules fired); disposition defaulted to ${finalDisp}`;
  } else if (!differentialPresent) {
    reason = `disposition produced but no differential (0 diagnosis rules fired)`;
  } else {
    reason = `differential (${dxFired} dx) but no genuine disposition; defaulted to ${finalDisp} (step-10 disposition rules never fire)`;
  }
  return { ...base, disposition_present: genuineDisp ? "true" : "false", last_stage: lastStage, classification: "PARTIAL", reason };
}

function loadDoneSet(): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(OUT_CSV)) return done;
  const lines = fs.readFileSync(OUT_CSV, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    done.add(line.split(",")[0]);
  }
  return done;
}

async function main() {
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(OUT_CSV) || fs.readFileSync(OUT_CSV, "utf8").trim() === "") {
    fs.writeFileSync(OUT_CSV, HEADER + "\n");
  }

  const master = await fetchMasterList();
  console.log(`[coverage] master complaint count from /diff-disposition/summary = ${master.length}`);
  console.log(`[coverage] mode = ${limit === Infinity ? "FULL" : `smoke (--limit ${limit})`}`);

  const done = loadDoneSet();
  if (done.size) console.log(`[coverage] resuming — ${done.size} complaints already recorded, skipping them`);

  const tally: Record<string, number> = { FULL: 0, PARTIAL: 0, BROKEN: 0, NO_DATA: 0 };
  let processed = 0;
  let liveCalls = 0;
  const startMs = Date.now();

  for (const s of master) {
    if (done.has(s.complaint_id)) continue;
    if (processed >= limit) break;

    let row: RowOut;

    // NO_DATA gate — static content gap, no live run.
    if (s.dx_count === 0 || s.question_count === 0) {
      const why =
        s.dx_count === 0 && s.question_count === 0
          ? "dx_count=0 and question_count=0"
          : s.dx_count === 0
          ? "dx_count=0"
          : "question_count=0";
      row = {
        complaint_id: s.complaint_id,
        detected_complaint: "",
        complaint_confidence: "",
        prefill_pct: "",
        l1_q: "",
        l2_q: "",
        l3_q: "",
        dx_count: String(s.dx_count),
        disposition_present: "false",
        last_stage: "skipped",
        classification: "NO_DATA",
        reason: why,
      };
    } else {
      try {
        const body = await postNarrativeRun(s.complaint_id);
        liveCalls++;
        row = classifyRunnable(s, body);
      } catch (e: any) {
        liveCalls++;
        row = {
          complaint_id: s.complaint_id,
          detected_complaint: "",
          complaint_confidence: "",
          prefill_pct: "",
          l1_q: "",
          l2_q: "",
          l3_q: "",
          dx_count: String(s.dx_count),
          disposition_present: "false",
          last_stage: "error",
          classification: "BROKEN",
          reason: `transport/exec error: ${csv(e?.message ?? e)}`,
        };
      }
    }

    fs.appendFileSync(OUT_CSV, toLine(row) + "\n");
    tally[row.classification] = (tally[row.classification] ?? 0) + 1;
    processed++;

    if (processed % 25 === 0) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(
        `[coverage] ${processed} processed | ${elapsed}s | live=${liveCalls} | ` +
          `FULL=${tally.FULL} PARTIAL=${tally.PARTIAL} BROKEN=${tally.BROKEN} NO_DATA=${tally.NO_DATA}`,
      );
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("──────────────────────────────────────────────");
  console.log(`[coverage] DONE this run: ${processed} processed in ${elapsed}s`);
  console.log(`[coverage] live narrative-run calls this run: ${liveCalls}`);
  console.log(`[coverage] estimated GPT cost this run: ~$${(liveCalls * PER_CALL_USD).toFixed(4)} ` + `(gpt-4o-mini, ${liveCalls} calls × ~$${PER_CALL_USD}/call — ESTIMATE; endpoint exposes no token usage)`);
  console.log(`[coverage] tally this run: FULL=${tally.FULL} PARTIAL=${tally.PARTIAL} BROKEN=${tally.BROKEN} NO_DATA=${tally.NO_DATA}`);
  const totalRows = loadDoneSet().size;
  console.log(`[coverage] total rows in ${path.relative(process.cwd(), OUT_CSV)}: ${totalRows} (master=${master.length})`);
}

main().catch((e) => {
  console.error("[coverage] FATAL:", e);
  process.exit(1);
});
