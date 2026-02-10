import fs from "fs";
import path from "path";
import { getFirestore } from "../firebase";
const db = getFirestore();

function norm(x: any) { return String(x ?? "").trim(); }
function inc(m: Map<string, number>, k: string, by = 1) { m.set(k, (m.get(k) || 0) + by); }
function topN(m: Map<string, number>, n = 15) {
  return Array.from(m.entries()).sort((a,b) => b[1]-a[1]).slice(0,n);
}

async function main() {
  const DAYS = Number(process.env.REPORT_DAYS || 7);
  const sinceMs = Date.now() - DAYS * 86400000;

  const snap = await db.collection("test_runs")
    .where("ts", ">=", sinceMs)
    .limit(5000)
    .get();

  let total = 0, fails = 0;
  const byFlowFail = new Map<string, number>();
  const byIssue = new Map<string, number>();

  const rows: any[] = [];

  for (const doc of snap.docs) {
    const r: any = doc.data();
    total++;

    const pass = Boolean(r?.score?.pass);
    if (!pass) {
      fails++;
      inc(byFlowFail, norm(r.flowId) || "UNKNOWN");
      const codes = (r?.score?.issues || []).map((i: any) => norm(i.code)).filter(Boolean);
      for (const c of codes) inc(byIssue, c);
    }

    rows.push({
      ts: r.ts,
      flowId: r.flowId,
      system: r.system,
      pass: pass ? "PASS" : "FAIL",
      severity: r?.score?.severity ?? "",
      expected: r?.expected?.expectedDisposition ?? "",
      actual: r?.output?.disposition ?? "",
      redFlag: r?.output?.redFlag ? "Y" : "N",
      issues: (r?.score?.issues || []).map((i:any)=>i.code).join(";"),
      routerText: (r?.routerText || "").slice(0, 120),
    });
  }

  console.log(`\n=== TEST RUN REPORT (last ${DAYS} days) ===`);
  console.log(`Total runs: ${total}`);
  console.log(`Fails: ${fails}`);

  console.log(`\nTop failing flows:`);
  for (const [k,v] of topN(byFlowFail, 10)) console.log(`  ${k}: ${v}`);

  console.log(`\nTop issue codes:`);
  for (const [k,v] of topN(byIssue, 15)) console.log(`  ${k}: ${v}`);

  const outDir = process.env.REPORT_OUTPUT_DIR || "./reports";
  fs.mkdirSync(outDir, { recursive: true });

  const csvPath = path.join(outDir, `test_run_report_${DAYS}d.csv`);
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(",")]
    .concat(rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")))
    .join("\n");
  fs.writeFileSync(csvPath, csv, "utf8");
  console.log(`\nWrote CSV: ${csvPath}`);

  const htmlPath = path.join(outDir, `test_run_report_${DAYS}d.html`);
  const topFlowsHtml = topN(byFlowFail, 15).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  const topIssuesHtml = topN(byIssue, 25).map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");

  const sampleFails = rows.filter(r => r.pass === "FAIL").slice(0, 30)
    .map(r => `<tr><td>${r.flowId}</td><td>${r.severity}</td><td>${r.expected}</td><td>${r.actual}</td><td>${r.issues}</td><td>${r.routerText}</td></tr>`)
    .join("");

  fs.writeFileSync(htmlPath, `
  <html><head><meta charset="utf-8"><title>Test Run Report</title></head>
  <body>
    <h2>Test Run Report (${DAYS} days)</h2>
    <p>Total: ${total} | Fails: ${fails}</p>

    <h3>Top failing flows</h3>
    <table border="1" cellpadding="4"><tr><th>Flow</th><th>Fails</th></tr>${topFlowsHtml}</table>

    <h3>Top issue codes</h3>
    <table border="1" cellpadding="4"><tr><th>Issue</th><th>Count</th></tr>${topIssuesHtml}</table>

    <h3>Sample failures (first 30)</h3>
    <table border="1" cellpadding="4">
      <tr><th>Flow</th><th>Severity</th><th>Expected</th><th>Actual</th><th>Issues</th><th>Router text</th></tr>
      ${sampleFails}
    </table>
  </body></html>
  `, "utf8");

  console.log(`Wrote HTML: ${htmlPath}`);
}

main().catch(e => {
  console.error("testRunReport failed:", e);
  process.exit(1);
});
