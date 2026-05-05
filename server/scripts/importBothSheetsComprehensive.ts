/**
 * importBothSheetsComprehensive.ts
 * Imports clinical data from both Google Sheets into kb_master_rules.
 *
 * Sheet 2 (MedAssistNovember18): GLOBAL_DIAGNOSIS_FINAL + GI/Pulm/ID/Neuro Diagnosis Masters
 *   → workup rules (Testing-Imaging, Testing-Labs columns), diagnosis rules, disposition rules
 *
 * Sheet 1 (Antibiotics in URI): summary tab (229 rows)
 *   → treatment-by-severity rules, antibiotic protocols (Adult/Peds/PenAllergy/Pregnant)
 *
 * Run: npx tsx server/scripts/importBothSheetsComprehensive.ts
 */

import { google } from "googleapis";
import { db } from "../db";
import { sql } from "drizzle-orm";

const SHEET2_ID = "1TzouZxa1BXmxUxtw0f9OirRO8KyYTlH4YSlimm97QCA";
const SHEET1_ID = "1Y_zuMIzjJacm8LxvCl7Q17e8cOVMgiqMGRpwog97Vs8";

function getAuth() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return new google.auth.GoogleAuth({
    ...(credsJson ? { credentials: JSON.parse(credsJson) } : {}),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function safe(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—\-\/\(\)\.&,]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
}

function severityToSafetyLevel(severity: string): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  const s = severity.toLowerCase();
  if (s.includes("critical") || s.includes("life-threat") || s.includes("emergent")) return "CRITICAL";
  if (s.includes("high") || s.includes("major") || s.includes("moderate-high") || s.includes("moderate–high") || s.includes("severe")) return "HIGH";
  if (s.includes("moderate") || s.includes("medium") || s.includes("mild-mod")) return "MODERATE";
  return "LOW";
}

async function fetchTab(sheets: any, spreadsheetId: string, tab: string): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A1:AH2000`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return ((res.data.values ?? []) as unknown[][]).map((r) =>
      (r as unknown[]).map((c) => safe(c))
    );
  } catch {
    console.warn(`  Tab not found or empty: ${tab}`);
    return [];
  }
}

interface RuleRow {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  priority: number;
  complaint_id: string;
  cluster_id: string | null;
  diagnosis_id: string | null;
  logic_description: string | null;
  logic_type: string;
  source_tab: string;
  disposition_impact: string | null;
  medication_impact: string | null;
  workup_impact: string | null;
  safety_level: string;
  notes: string | null;
}

const rules: RuleRow[] = [];
const seen = new Set<string>();
let skipped = 0;

function addRule(r: RuleRow) {
  if (seen.has(r.rule_id)) { skipped++; return; }
  seen.add(r.rule_id);
  rules.push(r);
}

function processSystemDiagnosisRow(row: string[], tabName: string) {
  const diagId      = row[0];
  const system      = row[1];
  const chiefCC     = row[2];
  const diagnosis   = row[3];
  const cluster     = row[4];
  const severity    = row[7] || "Moderate";
  const diagCrit    = row[8];
  const rfRaw       = (row[9] || "").toUpperCase();
  const isRedFlag   = rfRaw === "YES" || rfRaw === "Y";
  const examFind    = row[13];
  const testImaging = row[14];
  const testLabs    = row[15];
  const disposition = row[16];
  const erThresh    = row[19];
  const txFirst     = row[23];
  const txAlt       = row[24];
  const logicNotes  = row[30] || "";

  if (!diagId || !diagnosis || diagnosis.toLowerCase().startsWith("diagnosis")) return;
  if (diagId.toLowerCase().startsWith("diagnosis_id") || diagId.toLowerCase() === "diagnosis id") return;

  const complaintId = slugify(chiefCC || system || "general");
  const safeLevel   = severityToSafetyLevel(severity);
  const clusterSlug = cluster ? slugify(cluster) : null;
  const diagSlug    = slugify(diagId);

  addRule({
    rule_id:           `diag_${diagSlug}`,
    rule_name:         diagnosis,
    rule_type:         "diagnosis",
    priority:          isRedFlag ? 2 : 5,
    complaint_id:      complaintId,
    cluster_id:        clusterSlug,
    diagnosis_id:      diagId,
    logic_description: diagCrit || null,
    logic_type:        "boolean",
    source_tab:        tabName,
    disposition_impact:disposition || null,
    medication_impact: txFirst || null,
    workup_impact:     [testImaging, testLabs].filter(Boolean).join(" | ") || null,
    safety_level:      safeLevel,
    notes:             [logicNotes, txAlt].filter(Boolean).join(" | ") || null,
  });

  const workupText = [testImaging, testLabs].filter((t) => t && t.length > 4).join(" | ");
  if (workupText) {
    addRule({
      rule_id:           `workup_${diagSlug}`,
      rule_name:         `Workup: ${diagnosis}`,
      rule_type:         "workup",
      priority:          6,
      complaint_id:      complaintId,
      cluster_id:        clusterSlug,
      diagnosis_id:      diagId,
      logic_description: diagCrit || null,
      logic_type:        "conditional",
      source_tab:        tabName,
      disposition_impact:null,
      medication_impact: null,
      workup_impact:     workupText,
      safety_level:      safeLevel,
      notes:             examFind || null,
    });
  }

  if (erThresh && erThresh.length > 4) {
    addRule({
      rule_id:           `disp_${diagSlug}`,
      rule_name:         `Disposition: ${diagnosis}`,
      rule_type:         "disposition",
      priority:          3,
      complaint_id:      complaintId,
      cluster_id:        clusterSlug,
      diagnosis_id:      diagId,
      logic_description: erThresh,
      logic_type:        "threshold",
      source_tab:        tabName,
      disposition_impact:disposition || null,
      medication_impact: null,
      workup_impact:     null,
      safety_level:      isRedFlag ? "CRITICAL" : safeLevel,
      notes:             null,
    });
  }
}

function processSummaryRow(row: string[], idx: number) {
  const chiefCC   = row[2];
  const diagnosis = row[3];
  if (!chiefCC || !diagnosis) return;
  if (String(diagnosis).match(/^0+$/) || diagnosis.toLowerCase() === "diagnosis") return;

  const questions   = row[4];
  const mildCond    = row[5];
  const severeCond  = row[6];
  const persistCond = row[7];
  const worseCond   = row[8];
  const mildTx      = row[9];
  const severeTx    = row[10];
  const prolongTx   = row[11];
  const worsenTx    = row[12];
  const followUp    = row[13];
  const abxPeds     = row[14];
  const abxAdult    = row[15];
  const abxPenAlg   = row[16];
  const abxPreg     = row[18];

  const complaintId = slugify(chiefCC);
  const diagSlug    = slugify(diagnosis);
  const baseId      = `s1_${complaintId}_${diagSlug}_${idx}`.slice(0, 115);

  const txParts: string[] = [];
  if (mildTx    && String(mildTx)    !== "0") txParts.push(`Mild: ${mildTx}`);
  if (severeTx  && String(severeTx)  !== "0") txParts.push(`Severe: ${severeTx}`);
  if (prolongTx && String(prolongTx) !== "0") txParts.push(`Prolonged: ${prolongTx}`);
  if (worsenTx  && String(worsenTx)  !== "0") txParts.push(`Worsening: ${worsenTx}`);

  const condParts: string[] = [];
  if (mildCond    && String(mildCond)    !== "0") condParts.push(`Mild: ${mildCond}`);
  if (severeCond  && String(severeCond)  !== "0") condParts.push(`Severe: ${severeCond}`);
  if (persistCond && String(persistCond) !== "0") condParts.push(`Persistent: ${persistCond}`);
  if (worseCond   && String(worseCond)   !== "0") condParts.push(`Worsening: ${worseCond}`);

  if (txParts.length > 0) {
    addRule({
      rule_id:           `med_${baseId}`,
      rule_name:         `Tx: ${diagnosis}`,
      rule_type:         "medication",
      priority:          7,
      complaint_id:      complaintId,
      cluster_id:        null,
      diagnosis_id:      diagSlug,
      logic_description: condParts.join(" | ") || null,
      logic_type:        "conditional",
      source_tab:        "Sheet1_summary",
      disposition_impact:followUp && String(followUp) !== "0" ? String(followUp) : null,
      medication_impact: txParts.join("\n"),
      workup_impact:     null,
      safety_level:      "MODERATE",
      notes:             questions || null,
    });
  }

  const abxParts: string[] = [];
  if (abxAdult  && String(abxAdult)  !== "0") abxParts.push(`Adult: ${abxAdult}`);
  if (abxPeds   && String(abxPeds)   !== "0") abxParts.push(`Pediatric: ${abxPeds}`);
  if (abxPenAlg && String(abxPenAlg) !== "0") abxParts.push(`PenicillinAllergy: ${abxPenAlg}`);
  if (abxPreg   && String(abxPreg)   !== "0") abxParts.push(`Pregnant: ${abxPreg}`);

  if (abxParts.length > 0) {
    addRule({
      rule_id:           `abx_${baseId}`,
      rule_name:         `Antibiotics: ${diagnosis}`,
      rule_type:         "medication",
      priority:          6,
      complaint_id:      complaintId,
      cluster_id:        null,
      diagnosis_id:      diagSlug,
      logic_description: condParts.join(" | ") || null,
      logic_type:        "mapping",
      source_tab:        "Sheet1_summary",
      disposition_impact:null,
      medication_impact: abxParts.join("\n"),
      workup_impact:     null,
      safety_level:      "MODERATE",
      notes:             "Antibiotic protocol — population variants included",
    });
  }
}

async function insertBatch(batch: RuleRow[], batchNum: number): Promise<number> {
  if (batch.length === 0) return 0;
  let inserted = 0;
  for (const r of batch) {
    try {
      await db.execute(sql`
        INSERT INTO kb_master_rules
          (rule_id, rule_name, rule_type, priority, complaint_id, cluster_id, diagnosis_id,
           logic_description, logic_type, source_tab,
           disposition_impact, medication_impact, workup_impact,
           safety_level, notes, active, version, owner)
        VALUES (
          ${r.rule_id}, ${r.rule_name}, ${r.rule_type}, ${r.priority},
          ${r.complaint_id}, ${r.cluster_id}, ${r.diagnosis_id},
          ${r.logic_description}, ${r.logic_type}, ${r.source_tab},
          ${r.disposition_impact}, ${r.medication_impact}, ${r.workup_impact},
          ${r.safety_level}, ${r.notes}, true, 'v2', 'sheet_import'
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name          = EXCLUDED.rule_name,
          logic_description  = COALESCE(EXCLUDED.logic_description, kb_master_rules.logic_description),
          workup_impact      = COALESCE(EXCLUDED.workup_impact, kb_master_rules.workup_impact),
          medication_impact  = COALESCE(EXCLUDED.medication_impact, kb_master_rules.medication_impact),
          disposition_impact = COALESCE(EXCLUDED.disposition_impact, kb_master_rules.disposition_impact),
          notes              = COALESCE(EXCLUDED.notes, kb_master_rules.notes),
          version            = 'v2',
          last_updated       = NOW()
      `);
      inserted++;
    } catch (e: any) {
      console.warn(`  Skip ${r.rule_id}: ${e.message?.slice(0, 80)}`);
    }
  }
  return inserted;
}

async function main() {
  console.log("=== Comprehensive Sheet Import ===\n");

  const auth   = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const SHEET2_TABS = [
    "GLOBAL_DIAGNOSIS_FINAL",
    "GI_Diagnosis_Master",
    "Pulm_Diagnosis_Master",
    "ID_Diagnosis_Master",
    "Neuro_Diagnosis_Master",
    "ENT_DIAGNOSIS_MASTER",
    "Cards_Diagnosis_Master",
    "Derm_Diagnosis_Master",
    "ENDO_DIAGNOSES_MASTER",
    "Tox_Diagnosis_Master",
    "UroGyn_Diagnosis_Master",
  ];

  console.log("--- Sheet 2: System Diagnosis Masters ---");
  for (const tab of SHEET2_TABS) {
    const rows = await fetchTab(sheets, SHEET2_ID, tab);
    if (rows.length < 2) { console.log(`  ${tab}: empty`); continue; }
    const dataRows = rows.slice(1).filter((r) => r[0] && r[0].length > 2 && !r[0].toLowerCase().startsWith("diagnosis_id"));
    let count = 0;
    for (const row of dataRows) {
      processSystemDiagnosisRow(row, tab);
      count++;
    }
    console.log(`  ${tab}: ${count} rows read`);
  }

  console.log("\n--- Sheet 1: Summary (treatment-by-severity + antibiotics) ---");
  const sumRows = await fetchTab(sheets, SHEET1_ID, "summary");
  if (sumRows.length >= 3) {
    const dataRows = sumRows.slice(2).filter((r) => r[2] && r[2].length > 2 && r[3] && r[3].length > 2);
    for (let i = 0; i < dataRows.length; i++) {
      processSummaryRow(dataRows[i], i);
    }
    console.log(`  summary: ${dataRows.length} rows read`);
  }

  console.log(`\n--- Inserting ${rules.length} rules (${skipped} deduped) ---`);

  const BATCH = 200;
  let totalInserted = 0;
  for (let i = 0; i < rules.length; i += BATCH) {
    const batch = rules.slice(i, i + BATCH);
    const n = await insertBatch(batch, Math.floor(i / BATCH) + 1);
    totalInserted += n;
    process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: ${n}/${batch.length} inserted\n`);
  }

  const stats = await db.execute(sql`
    SELECT rule_type, COUNT(*) as cnt
    FROM kb_master_rules
    GROUP BY rule_type
    ORDER BY cnt DESC
  `);

  console.log("\n=== kb_master_rules final breakdown ===");
  for (const row of stats.rows as any[]) {
    console.log(`  ${row.rule_type.padEnd(20)} ${row.cnt}`);
  }

  const total = await db.execute(sql`SELECT COUNT(*) as cnt FROM kb_master_rules`);
  console.log(`\nTotal rules: ${(total.rows[0] as any).cnt}`);
  console.log(`Inserted this run: ${totalInserted}`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
