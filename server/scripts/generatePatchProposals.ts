import fs from "fs";
import path from "path";
import { db } from "../firebase";
import { getSheetRows } from "../sheets/sheetHelper";

function norm(x: any) { return String(x ?? "").trim(); }
function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function topN<T>(arr: T[], n: number) { return arr.slice(0, n); }

type ProposedFlowPatch = {
  flowId: string;
  issueCounts: Record<string, number>;
  qidsToAdd: Set<string>;
  samples: { severity: number; issues: string; routerText: string }[];
};

async function loadExistingRedFlagQidsByFlow(): Promise<Map<string, Set<string>>> {
  const { rowsAsObjects } = await getSheetRows("CLINICAL_RULES");
  const m = new Map<string, Set<string>>();

  for (const r of rowsAsObjects) {
    const flowId = norm((r as any).flow_id);
    if (!flowId) continue;

    const key = norm((r as any).rule_key);
    const val = norm((r as any).value);
    const active = norm((r as any).active).toUpperCase();
    if (active === "N") continue;

    const compositeKey = `${flowId}::RED_FLAG_QIDS`;
    const isRedFlagQidsRow = (key === compositeKey) || (key === "RED_FLAG_QIDS");

    if (!isRedFlagQidsRow) continue;

    const set = m.get(flowId) || new Set<string>();
    for (const q of val.split(",").map(s => s.trim()).filter(Boolean)) set.add(q);
    m.set(flowId, set);
  }

  return m;
}

function extractRfYesQids(expectedReasons: any): string[] {
  const reasons: string[] = Array.isArray(expectedReasons) ? expectedReasons : [];
  const qids: string[] = [];
  for (const r of reasons) {
    const s = norm(r);
    if (s.startsWith("rf_yes:")) qids.push(s.slice("rf_yes:".length).trim());
  }
  return qids;
}

function issueCodes(scoreIssues: any): string[] {
  const issues = Array.isArray(scoreIssues) ? scoreIssues : [];
  return issues.map((i: any) => norm(i.code)).filter(Boolean);
}

async function main() {
  const DAYS = Number(process.env.REPORT_DAYS || 7);
  const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || "./reports";
  ensureDir(OUTPUT_DIR);

  const sinceMs = Date.now() - DAYS * 86400000;

  console.log(`Generating patch proposals from Firestore test_runs (last ${DAYS} days)...`);

  const existing = await loadExistingRedFlagQidsByFlow();

  const snap = await db.collection("test_runs")
    .where("ts", ">=", sinceMs)
    .limit(8000)
    .get();

  const byFlow = new Map<string, ProposedFlowPatch>();

  let total = 0;
  let considered = 0;

  for (const doc of snap.docs) {
    const r: any = doc.data();
    total++;

    const pass = Boolean(r?.score?.pass);
    if (pass) continue;

    const flowId = norm(r.flowId);
    if (!flowId) continue;

    const expectedDisp = norm(r?.expected?.expectedDisposition);
    const codes = issueCodes(r?.score?.issues);

    const isUrgentExpected = expectedDisp === "urgent_or_ed";
    const shouldPropose =
      isUrgentExpected &&
      (codes.includes("DISPOSITION_UNDERSHOOT") || codes.includes("REDFLAG_FALSE"));

    if (!shouldPropose) continue;

    const rfQids = extractRfYesQids(r?.expected?.reasons);
    if (!rfQids.length) continue;

    considered++;

    const patch = byFlow.get(flowId) || {
      flowId,
      issueCounts: {},
      qidsToAdd: new Set<string>(),
      samples: [],
    };

    for (const c of codes) patch.issueCounts[c] = (patch.issueCounts[c] || 0) + 1;

    const existingSet = existing.get(flowId) || new Set<string>();
    for (const qid of rfQids) {
      if (!existingSet.has(qid)) patch.qidsToAdd.add(qid);
    }

    if (patch.samples.length < 8) {
      patch.samples.push({
        severity: Number(r?.score?.severity || 0),
        issues: codes.join(";"),
        routerText: norm(r?.routerText).slice(0, 140),
      });
    }

    byFlow.set(flowId, patch);
  }

  const patches = Array.from(byFlow.values())
    .filter(p => p.qidsToAdd.size > 0)
    .sort((a, b) => b.qidsToAdd.size - a.qidsToAdd.size);

  const csvRows: string[][] = [["flow_id", "rule_key", "value", "active"]];

  for (const p of patches) {
    const flowId = p.flowId;
    const compositeKey = `${flowId}::RED_FLAG_QIDS`;

    const current = existing.get(flowId) || new Set<string>();
    const merged = new Set<string>([...current, ...p.qidsToAdd]);

    const value = Array.from(merged).join(",");
    csvRows.push([flowId, compositeKey, value, "Y"]);
  }

  const csvPath = path.join(OUTPUT_DIR, "CLINICAL_RULES_PATCH_PROPOSED.csv");
  const csv = csvRows.map(row => row.map(v => JSON.stringify(v)).join(",")).join("\n");
  fs.writeFileSync(csvPath, csv, "utf8");

  const mdPath = path.join(OUTPUT_DIR, "patch_proposals.md");
  const lines: string[] = [];

  lines.push(`# Patch Proposals (last ${DAYS} days)`);
  lines.push(``);
  lines.push(`Scanned test_runs: **${total}**`);
  lines.push(`Considered failing urgent-expected cases: **${considered}**`);
  lines.push(`Flows with proposed RED_FLAG_QIDS additions: **${patches.length}**`);
  lines.push(``);
  lines.push(`## Proposed rule patches`);
  lines.push(`CSV output: \`${csvPath}\``);
  lines.push(`Import command (UPSERT by rule_key):`);
  lines.push(`\`\`\`bash`);
  lines.push(`npx tsx server/scripts/sheetImport.ts CLINICAL_RULES ${csvPath} upsert rule_key`);
  lines.push(`\`\`\``);
  lines.push(``);

  for (const p of topN(patches, 25)) {
    const issueSummary = Object.entries(p.issueCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");

    lines.push(`### ${p.flowId}`);
    lines.push(`- Add QIDs (${p.qidsToAdd.size}): ${Array.from(p.qidsToAdd).join(", ")}`);
    lines.push(`- Issue counts: ${issueSummary || "n/a"}`);
    lines.push(`- Samples:`);
    for (const s of p.samples) {
      lines.push(`  - sev=${s.severity} issues=${s.issues} text="${s.routerText}"`);
    }
    lines.push(``);
  }

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(`Done.`);
  console.log(`Wrote: ${mdPath}`);
  console.log(`Wrote: ${csvPath}`);
}

main().catch((e) => {
  console.error("generatePatchProposals failed:", e);
  process.exit(1);
});
