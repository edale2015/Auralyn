import fs from "fs";
import path from "path";
import { db } from "../firebase";
import { getSheetRows } from "../sheets/sheetHelper";

function norm(x: any) { return String(x ?? "").trim(); }
function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function extractRowKey(notes: string): string | null {
  const m = (notes || "").match(/ROW_KEY=([^\s;]+)/);
  return m ? m[1].trim() : null;
}

type MedRow = Record<string, any>;

async function loadMedRowsByRowKey(): Promise<Map<string, MedRow>> {
  const { rowsAsObjects } = await getSheetRows("CLINICAL_MEDICATIONS");
  const map = new Map<string, MedRow>();

  for (const r of rowsAsObjects) {
    const notes = norm((r as any).Notes);
    const rk = extractRowKey(notes);
    if (rk) map.set(rk, r as any);
  }
  return map;
}

function issueCodes(issues: any): string[] {
  const arr = Array.isArray(issues) ? issues : [];
  return arr.map((i: any) => norm(i.code)).filter(Boolean);
}

function extractMedRowKeysFromTestRun(r: any): string[] {
  const out = r?.output?.raw || {};
  const proposal = out?.proposal || {};
  const keys: string[] = [];

  const pack = proposal?.rulePacks?.medPack || proposal?.medPack || proposal?.med_pack;
  if (typeof pack === "string" && pack.includes("ROW_KEY=")) {
    const parts = pack.split(/[;,]+/).map((s: string) => s.trim());
    for (const p of parts) {
      const m = p.match(/ROW_KEY=([^\s;]+)/);
      if (m) keys.push(m[1].trim());
    }
  }

  const arrs = [proposal?.medIds, proposal?.med_ids, proposal?.medications, proposal?.meds].filter(Boolean);
  for (const a of arrs) {
    if (Array.isArray(a)) {
      for (const item of a) {
        const s = norm(item);
        const m = s.match(/ROW_KEY=([^\s;]+)/);
        if (m) keys.push(m[1].trim());
      }
    }
  }

  return Array.from(new Set(keys));
}

function addSuggestion(md: string[], title: string, lines: string[]) {
  md.push(`### ${title}`);
  for (const l of lines) md.push(`- ${l}`);
  md.push("");
}

async function main() {
  const DAYS = Number(process.env.REPORT_DAYS || 7);
  const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || "./reports";
  ensureDir(OUTPUT_DIR);

  const sinceMs = Date.now() - DAYS * 86400000;

  const medsByKey = await loadMedRowsByRowKey();

  const snap = await db.collection("test_runs")
    .where("ts", ">=", sinceMs)
    .limit(8000)
    .get();

  const keyIssueCount = new Map<string, Map<string, number>>();
  const keySamples = new Map<string, string[]>();

  let scanned = 0;
  let failures = 0;

  for (const doc of snap.docs) {
    const r: any = doc.data();
    scanned++;

    if (r?.score?.pass) continue;
    failures++;

    const codes = issueCodes(r?.score?.issues);
    const medRelevant = codes.filter(c => c.startsWith("MED_"));
    if (!medRelevant.length) continue;

    const rowKeys = extractMedRowKeysFromTestRun(r);
    if (!rowKeys.length) continue;

    for (const rk of rowKeys) {
      if (!keyIssueCount.has(rk)) keyIssueCount.set(rk, new Map());
      const m = keyIssueCount.get(rk)!;
      for (const c of medRelevant) m.set(c, (m.get(c) || 0) + 1);

      if (!keySamples.has(rk)) keySamples.set(rk, []);
      const samples = keySamples.get(rk)!;
      if (samples.length < 6) {
        const rt = norm(r?.routerText).slice(0, 120);
        samples.push(`flow=${r.flowId} issues=${medRelevant.join(";")} text="${rt}"`);
      }
    }
  }

  const ranked = Array.from(keyIssueCount.entries()).map(([rk, m]) => {
    const total = Array.from(m.values()).reduce((a,b)=>a+b,0);
    return { rk, m, total };
  }).sort((a,b)=>b.total-a.total);

  const md: string[] = [];
  md.push(`# Medication Data Cleanup Suggestions (last ${DAYS} days)`);
  md.push(`Scanned test_runs: **${scanned}**`);
  md.push(`Failing runs: **${failures}**`);
  md.push(`Meds implicated: **${ranked.length}**`);
  md.push("");

  const { header } = await getSheetRows("CLINICAL_MEDICATIONS");
  const csvRows: string[][] = [header];

  for (const item of ranked.slice(0, 50)) {
    const row = medsByKey.get(item.rk);
    if (!row) continue;

    const medName = norm(row.Medication_Name) || item.rk;
    const group = norm(row.Medication_Group);
    const preg = norm(row.Pregnancy_Considerations);
    const contra = norm(row.Contraindications);

    const issues = Array.from(item.m.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(", ");

    const suggestions: string[] = [];
    let changed = false;

    if (item.m.has("MED_BARIATRIC_NSAID") && !group.toUpperCase().includes("NSAID")) {
      suggestions.push(`Consider setting Medication_Group to include "NSAID" (currently "${group}")`);
      row.Medication_Group = group ? `${group}; NSAID` : "NSAID";
      changed = true;
    }

    if (item.m.has("MED_PREGNANCY_CONTRA") && !preg.toLowerCase().includes("avoid") && !contra.toLowerCase().includes("preg")) {
      suggestions.push(`Add clear pregnancy guidance (e.g., "avoid in pregnancy" or specific trimester caution).`);
      row.Pregnancy_Considerations = preg ? `${preg} | avoid in pregnancy (flag)` : "avoid in pregnancy (flag)";
      changed = true;
    }

    if (item.m.has("MED_ALLERGY_PEN") && !contra.toLowerCase().includes("penicillin")) {
      suggestions.push(`Add contraindication note: "penicillin allergy".`);
      row.Contraindications = contra ? `${contra} | penicillin allergy` : "penicillin allergy";
      changed = true;
    }
    if (item.m.has("MED_ALLERGY_SULFA") && !contra.toLowerCase().includes("sulfa")) {
      suggestions.push(`Add contraindication note: "sulfa allergy".`);
      row.Contraindications = contra ? `${contra} | sulfa allergy` : "sulfa allergy";
      changed = true;
    }

    addSuggestion(md, `${medName} (${item.rk})`, [
      `Issue counts: ${issues}`,
      ...suggestions,
      ...(keySamples.get(item.rk) || []).map(s => `Sample: ${s}`),
    ]);

    if (changed) {
      const outRow = header.map((h: string) => norm((row as any)[h]));
      csvRows.push(outRow);
    }
  }

  const mdPath = path.join(OUTPUT_DIR, "med_cleanup_suggestions.md");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  if (csvRows.length > 1) {
    const csvPath = path.join(OUTPUT_DIR, "CLINICAL_MEDICATIONS_PATCH_PROPOSED.csv");
    const csv = csvRows.map(row => row.map(v => JSON.stringify(v)).join(",")).join("\n");
    fs.writeFileSync(csvPath, csv, "utf8");
    console.log(`Wrote: ${csvPath}`);
  }

  console.log(`Wrote: ${mdPath}`);
}

main().catch((e) => {
  console.error("generateMedCleanupProposals failed:", e);
  process.exit(1);
});
