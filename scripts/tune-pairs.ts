process.env.HARNESS_MODE = "1";

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

type MicroRule = {
  Complaint_Slug: string;
  Dx_ID: string;
  Rule_ID: string;
  Logic: string;
  Points: string;
};

const CLUSTER_RULES_CSV = path.resolve("server/data/csv/CLUSTER_SCORING_RULES.csv");
const MICRO_PACKS_CSV = path.resolve("data/micro_packs.csv");
const PAIRS_FILE = path.resolve("phase2a_pairs_20.txt");
const REPORT_PATH = path.resolve("phase2a_pairs_report.json");

function readText(p: string) {
  return fs.readFileSync(p, "utf8");
}
function writeText(p: string, s: string) {
  fs.writeFileSync(p, s, "utf8");
}

function parsePairs(text: string): Array<{ id: string; a: string; b: string }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [left, right] = l.split("|").map((x) => x.trim());
      const [a, b] = right.split(",").map((x) => x.trim());
      return { id: left, a, b };
    });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseMicroPacks(csvText: string): MicroRule[] {
  const lines = csvText.trim().split("\n");
  if (lines.length <= 1) return [];
  const header = splitCsvLine(lines[0]);
  const idx = (k: string) => header.indexOf(k);
  return lines.slice(1).map((l) => {
    const cols = splitCsvLine(l);
    return {
      Complaint_Slug: cols[idx("Complaint_Slug")] ?? "",
      Dx_ID: cols[idx("Dx_ID")] ?? "",
      Rule_ID: cols[idx("Rule_ID")] ?? "",
      Logic: cols[idx("Logic")] ?? "",
      Points: cols[idx("Points")] ?? "",
    };
  }).filter(r => r.Complaint_Slug && r.Rule_ID);
}

function appendRules(existingCsv: string, rules: MicroRule[]): string {
  const lines = existingCsv.trimEnd().split("\n");
  const out = [...lines];
  for (const r of rules) {
    const logic = r.Logic.includes(",") || r.Logic.includes('"')
      ? `"${r.Logic.replace(/"/g, '""')}"`
      : r.Logic;
    const row = `${r.Complaint_Slug},${r.Dx_ID},${r.Rule_ID},${r.Points},${logic},${r.Rule_ID} suppressor`;
    out.push(row);
  }
  return out.join("\n") + "\n";
}

function removeRulesForSlug(csv: string, slug: string): string {
  const lines = csv.split("\n");
  return lines.filter(l => {
    if (!l.trim()) return true;
    return !l.startsWith(`${slug},`) || !l.endsWith("suppressor");
  }).join("\n");
}

function runHarness(slug: string): { ok: boolean; output: string } {
  try {
    const output = execSync(
      `npx tsx scripts/run_harness.ts tests/cases/${slug}`,
      { encoding: "utf8", stdio: "pipe", timeout: 60000 }
    );
    const hasFailure = output.includes("FAIL ") && !output.includes("FAIL: 0");
    const summaryMatch = output.match(/PASS:\s*(\d+)\s*\|\s*FAIL:\s*(\d+)/);
    const failCount = summaryMatch ? parseInt(summaryMatch[2]) : (hasFailure ? 1 : 0);
    return { ok: failCount === 0, output };
  } catch (e: any) {
    const output = (e?.stdout ? String(e.stdout) : "") + "\n" + (e?.stderr ? String(e.stderr) : "");
    return { ok: false, output };
  }
}

function extractFailingCases(output: string): string[] {
  const ids: string[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/FAIL\s+(\S+)\s+-/);
    if (m) ids.push(m[1]);
  }
  return Array.from(new Set(ids));
}

function main() {
  console.log("Building micro_packs.csv...");
  try {
    execSync("npx tsx scripts/build-micro-packs.ts", { stdio: "inherit", timeout: 30000 });
  } catch {
    console.log("Warning: build-micro-packs failed, using existing micro_packs.csv if available");
  }

  if (!fs.existsSync(MICRO_PACKS_CSV)) {
    console.error(`No micro_packs.csv found at ${MICRO_PACKS_CSV}`);
    process.exit(1);
  }

  const pairs = parsePairs(readText(PAIRS_FILE));
  const microRules = parseMicroPacks(readText(MICRO_PACKS_CSV));

  console.log(`\nLoaded ${pairs.length} pairs, ${microRules.length} micro rules\n`);

  const report: any = {
    startedAt: new Date().toISOString(),
    totalPairs: pairs.length,
    pairs: [],
  };

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const p of pairs) {
    const pairRulesA = microRules.filter(r => r.Complaint_Slug === p.a);
    const pairRulesB = microRules.filter(r => r.Complaint_Slug === p.b);
    const pairRules = [...pairRulesA, ...pairRulesB];

    if (pairRules.length === 0) {
      console.log(`  ${p.id} | ${p.a}, ${p.b} → SKIP (no micro rules)`);
      report.pairs.push({ pair: p.id, complaints: [p.a, p.b], status: "SKIP", reason: "no micro rules" });
      skipCount++;
      continue;
    }

    const snapshot = readText(CLUSTER_RULES_CSV);

    let cleaned = snapshot;
    for (const slug of [p.a, p.b]) {
      const hasRules = pairRules.some(r => r.Complaint_Slug === slug);
      if (hasRules) {
        cleaned = removeRulesForSlug(cleaned, slug);
      }
    }

    const patched = appendRules(cleaned, pairRules);
    writeText(CLUSTER_RULES_CSV, patched);

    console.log(`  ${p.id} | ${p.a} (${pairRulesA.length} rules), ${p.b} (${pairRulesB.length} rules)`);

    const ra = runHarness(p.a);
    const rb = runHarness(p.b);
    const ok = ra.ok && rb.ok;

    if (!ok) {
      writeText(CLUSTER_RULES_CSV, snapshot);

      const failedComplaints = [];
      if (!ra.ok) failedComplaints.push({ complaint: p.a, cases: extractFailingCases(ra.output) });
      if (!rb.ok) failedComplaints.push({ complaint: p.b, cases: extractFailingCases(rb.output) });

      console.log(`    → FAIL (reverted)`);
      for (const fc of failedComplaints) {
        console.log(`      ${fc.complaint}: ${fc.cases.join(", ")}`);
      }

      report.pairs.push({
        pair: p.id,
        complaints: [p.a, p.b],
        status: "FAIL",
        failed: failedComplaints,
        rulesAttempted: pairRules.length,
      });
      failCount++;
    } else {
      console.log(`    → PASS (kept ${pairRules.length} rules)`);
      report.pairs.push({
        pair: p.id,
        complaints: [p.a, p.b],
        status: "PASS",
        appliedRules: pairRules.length,
      });
      passCount++;
    }
  }

  report.finishedAt = new Date().toISOString();
  report.summary = { pass: passCount, fail: failCount, skip: skipCount };
  writeText(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`PASS: ${passCount}  |  FAIL: ${failCount}  |  SKIP: ${skipCount}  |  Total: ${pairs.length}`);
  console.log(`Report: ${REPORT_PATH}`);
}

main();
