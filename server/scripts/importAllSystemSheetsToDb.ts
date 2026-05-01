/**
 * importAllSystemSheetsToDb.ts
 * Extended sheet importer — covers 37 system-specific clinical tabs.
 *
 * Tabs imported:
 *   DIAGNOSIS  (→ kb_diagnosis_rules):
 *     ENT_DIAGNOSIS_MASTER, GI_Diagnosis_Master, Derm_Diagnosis_Master,
 *     Cards_Diagnosis_Master, ENDO_DIAGNOSES_MASTER, ID_Diagnosis_Master,
 *     Pulm_Diagnosis_Master, Tox_Diagnosis_Master, UroGyn_Diagnosis_Master,
 *     ENV_DIAGNOSIS_MASTER, GLOBAL_DIAGNOSIS_FINAL
 *
 *   RED FLAGS  (→ kb_red_flag_rules):
 *     ENT_RedFlags, GI_RedFlags, Derm_RedFlags, Cards_RedFlags,
 *     Endo_RedFlags, Env_RedFlags, Tox_RefFlags
 *
 *   MEDICATIONS (→ kb_treatment_rules):
 *     ENT_Medications_Master, GI_Medications_Master, Derm_Medications_Master,
 *     Cards_Medications_Master, Endo_Medications_Master, Env_Medications_Master,
 *     Tox_Meds_Master, UroGyn_Medication_Master, Pulm_Meds_Master,
 *     GLOBAL_MEDICATIONS_FINAL
 *
 *   SECONDARY QUESTIONS (→ kb_questions):
 *     GI_SECOND, ENDO_SECOND, DERM_SECOND, CARDS_SECOND,
 *     ENV_SECOND, TOX_SECOND, UROGYN_SECOND
 *
 *   MODIFIERS  (→ kb_modifiers):
 *     DERM_MODIFIERS
 */

import { google } from "googleapis";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── shared helpers ──────────────────────────────────────────────────────────

function safe(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function yn(v: unknown): boolean {
  const s = safe(v).toUpperCase();
  return s === "Y" || s === "YES" || s === "TRUE";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 120);
}

function pgText(v: unknown): string | null {
  const s = safe(v);
  return s === "" ? null : s;
}

function makeRuleId(prefix: string, parts: string[]): string {
  return slugify(`${prefix}_${parts.filter(Boolean).join("_")}`).slice(0, 120);
}

function getAuth() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return new google.auth.GoogleAuth({
    ...(credsJson ? { credentials: JSON.parse(credsJson) } : {}),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getSpreadsheetId(): string {
  const id =
    process.env.PACKS_SPREADSHEET_ID ??
    process.env.SHEETS_SPREADSHEET_ID ??
    process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("No spreadsheet ID configured");
  return id;
}

async function fetchTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:AJ`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return ((res.data.values ?? []) as unknown[][]).map(r =>
      r.map(c => safe(c))
    );
  } catch {
    return [];
  }
}

interface Counts { inserted: number; updated: number; skipped: number }

// ─── DIAGNOSIS MASTER (all systems use the same column layout) ───────────────
// col 0: Diagnosis ID   col 1: System   col 2: Chief Complaint / Complaint
// col 3: Diagnosis      col 9: Red Flag?   last col or col 31: Dx_Key / active

async function importDiagnosisTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<Counts> {
  const rows = await fetchTab(sheets, spreadsheetId, tab);
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };

  const header = rows[0].map(h => h.replace(/\\/g, "").trim().toLowerCase());

  // find column indices dynamically so slight header differences don't break us
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = header.findIndex(h => h.includes(n.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iDxId      = col(["diagnosis id", "diagnosis_id"]);
  const iSystem    = col(["system"]);
  const iCC        = col(["chief complaint", "complaint"]);
  const iDxLabel   = col(["diagnosis"]);
  const iSeverity  = col(["severity level", "severity_level"]);
  const iRedFlag   = col(["red flag?"]);
  const iDisp      = col(["disposition"]);
  const iTriage    = col(["default triage", "default_triage"]);
  const iTx1       = col(["treatment – first", "treatment first"]);
  const iDxKey     = col(["dx_key"]);

  if (iDxId < 0 || iDxLabel < 0) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0, updated = 0, skipped = 0;
  const data = rows.slice(1);

  for (const r of data) {
    const diagnosis_id = safe(r[iDxId]);
    const diagnosis_label = safe(r[iDxLabel > 0 ? iDxLabel : 3]);
    if (!diagnosis_id || !diagnosis_label) { skipped++; continue; }

    const rule_id      = diagnosis_id;
    const cc           = iCC >= 0 ? safe(r[iCC]) : "";
    const system       = iSystem >= 0 ? safe(r[iSystem]) : tab.split("_")[0];
    const complaint_id = slugify(cc) || slugify(system + "_" + diagnosis_id);
    const cannot_miss  = iRedFlag >= 0 ? yn(r[iRedFlag]) : false;
    const active       = iDxKey >= 0 ? (safe(r[iDxKey]).toUpperCase() === "Y" || safe(r[iDxKey]) === "") : true;

    const feature_likelihoods: Record<string, string | null> = {
      system,
      severity:    iSeverity >= 0 ? pgText(r[iSeverity]) : null,
      disposition: iDisp >= 0     ? pgText(r[iDisp]) : null,
      triage:      iTriage >= 0   ? pgText(r[iTriage]) : null,
      tx_first:    iTx1 >= 0      ? pgText(r[iTx1]) : null,
    };

    try {
      const res = await db.execute(sql`
        INSERT INTO kb_diagnosis_rules
          (rule_id, complaint_id, diagnosis_id, diagnosis_label, cannot_miss,
           feature_likelihoods, base_probability, active)
        VALUES
          (${rule_id}, ${complaint_id}, ${diagnosis_id}, ${diagnosis_label},
           ${cannot_miss}, ${JSON.stringify(feature_likelihoods)}::jsonb, 0.1, ${active})
        ON CONFLICT (rule_id) DO UPDATE SET
          complaint_id        = EXCLUDED.complaint_id,
          diagnosis_label     = EXCLUDED.diagnosis_label,
          cannot_miss         = EXCLUDED.cannot_miss,
          feature_likelihoods = EXCLUDED.feature_likelihoods,
          active              = EXCLUDED.active,
          updated_at          = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS was_insert
      `);
      (res.rows[0] as any)?.was_insert ? inserted++ : updated++;
    } catch { skipped++; }
  }
  return { inserted, updated, skipped };
}

// ─── RED FLAGS — per-system schema mapping ───────────────────────────────────

interface RedFlagSchema {
  ruleId: number;          // col index for the flag's unique ID
  complaintOrDx: number;   // col for complaint_id / diagnosis_id (used as complaint)
  label: number;           // col for short name / label
  trigger: number;         // col for question / trigger
  rationale?: number;      // col for "why dangerous"
  severity?: string;       // fixed severity to assign
}

const RED_FLAG_SCHEMAS: Record<string, RedFlagSchema> = {
  ENT_RedFlags:   { ruleId: 4, complaintOrDx: 0, label: 5, trigger: 6, rationale: 7, severity: "CRITICAL" },
  GI_RedFlags:    { ruleId: 0, complaintOrDx: 3, label: 1, trigger: 2, rationale: 5, severity: "HIGH" },
  Derm_RedFlags:  { ruleId: 5, complaintOrDx: 0, label: 6, trigger: 7, severity: "HIGH" },
  Cards_RedFlags: { ruleId: 5, complaintOrDx: 0, label: 6, trigger: 7, severity: "CRITICAL" },
  Endo_RedFlags:  { ruleId: 5, complaintOrDx: 3, label: 6, trigger: 7, severity: "HIGH" },
  Env_RedFlags:   { ruleId: 4, complaintOrDx: 1, label: 5, trigger: 6, rationale: 7, severity: "CRITICAL" },
  Tox_RefFlags:   { ruleId: 4, complaintOrDx: 1, label: 5, trigger: 6, rationale: 7, severity: "CRITICAL" },
};

async function importRedFlagTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<Counts> {
  const schema = RED_FLAG_SCHEMAS[tab];
  if (!schema) return { inserted: 0, updated: 0, skipped: 0 };

  const rows = await fetchTab(sheets, spreadsheetId, tab);
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows.slice(1)) {
    const rule_id      = safe(r[schema.ruleId]);
    const trigger_expr = safe(r[schema.trigger]);
    if (!rule_id || !trigger_expr) { skipped++; continue; }

    const complaint_id = slugify(safe(r[schema.complaintOrDx])) || "general";
    const label        = safe(r[schema.label]) || rule_id;
    const rationale    = schema.rationale !== undefined ? pgText(r[schema.rationale]) : null;
    const severity     = schema.severity ?? "HIGH";

    try {
      const res = await db.execute(sql`
        INSERT INTO kb_red_flag_rules
          (rule_id, complaint_id, label, trigger_expr, severity, action, rationale, active)
        VALUES
          (${rule_id}, ${complaint_id}, ${label}, ${trigger_expr}, ${severity}, 'ER_SEND', ${rationale}, true)
        ON CONFLICT (rule_id) DO UPDATE SET
          complaint_id = EXCLUDED.complaint_id,
          label        = EXCLUDED.label,
          trigger_expr = EXCLUDED.trigger_expr,
          severity     = EXCLUDED.severity,
          rationale    = EXCLUDED.rationale,
          updated_at   = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS was_insert
      `);
      (res.rows[0] as any)?.was_insert ? inserted++ : updated++;
    } catch { skipped++; }
  }
  return { inserted, updated, skipped };
}

// ─── MEDICATIONS — two column patterns ──────────────────────────────────────
// Type A: col0=Diagnosis_ID, col1=System, col2=Medication_Name …
// Type B: col0=System, col1=Medication_Name, col2=Group, col3=Indications, col4=First_Line…

async function importMedicationsTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string,
  hasDiagnosisId: boolean
): Promise<Counts> {
  const rows = await fetchTab(sheets, spreadsheetId, tab);
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };

  // For GLOBAL_MEDICATIONS_FINAL the header has "DIAGNOSIS_ID" (uppercase)
  // For ENT/Derm it also has Diagnosis_ID at col 0
  // For system-only tabs, shift offsets by -1 (no dx col)

  const SHIFT = hasDiagnosisId ? 0 : -1; // offset for dx-less tabs
  const iDx   = hasDiagnosisId ? 0 : -1;
  const iSys  = hasDiagnosisId ? 1 : 0;
  const iName = hasDiagnosisId ? 2 : 1;
  const iGrp  = hasDiagnosisId ? 3 : 2;
  const iInd  = hasDiagnosisId ? 4 : 3;
  const iFL   = hasDiagnosisId ? 5 : 4;
  const iAD   = hasDiagnosisId ? 6 : 5;
  const iAMD  = hasDiagnosisId ? 7 : 6;
  const iPD   = hasDiagnosisId ? 8 : 7;
  const iPrg  = hasDiagnosisId ? 9 : 8;
  const iCI   = hasDiagnosisId ? 10 : 9;
  const iKI   = hasDiagnosisId ? 11 : 10;
  const iSE   = hasDiagnosisId ? 12 : 11;
  const iRt   = hasDiagnosisId ? 13 : 12;
  const iRA   = hasDiagnosisId ? 14 : 13;
  const iHA   = hasDiagnosisId ? 15 : 14;
  const iNt   = hasDiagnosisId ? 16 : 15;

  const seen = new Set<string>();
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows.slice(1)) {
    const medication_name = safe(r[iName]);
    if (!medication_name) { skipped++; continue; }

    const diagnosis_id = iDx >= 0 ? (pgText(r[iDx]) ?? "") : "";
    const system       = safe(r[iSys]);
    const base         = slugify(`MED_${tab}_${medication_name}_${diagnosis_id}`).slice(0, 100);
    let rule_id = base;
    let suffix = 1;
    while (seen.has(rule_id)) rule_id = `${base}_${++suffix}`;
    seen.add(rule_id);

    const complaint_id = diagnosis_id
      ? diagnosis_id.split("_").slice(0, 2).join("_").toLowerCase()
      : slugify(system);

    const is_first_line  = yn(r[iFL]);
    const adult_dose     = pgText(r[iAD]);
    const adult_max_dose = pgText(r[iAMD]);
    const pediatric_dose = pgText(r[iPD]);
    const pregnancy_cat  = pgText(r[iPrg]);
    const contraind      = pgText(r[iCI]);
    const interactions   = pgText(r[iKI]);
    const side_effects   = pgText(r[iSE]);
    const route          = pgText(r[iRt]);
    const renal_adjust   = yn(r[iRA]) ? "Yes" : pgText(r[iRA]);
    const hepatic_adjust = yn(r[iHA]) ? "Yes" : pgText(r[iHA]);
    const notes          = pgText(r[iNt]);
    const med_group      = pgText(r[iGrp]);

    try {
      const res = await db.execute(sql`
        INSERT INTO kb_treatment_rules
          (rule_id, complaint_id, diagnosis_id, medication_name, medication_group,
           is_first_line, adult_dose, adult_max_dose, pediatric_dose,
           pregnancy_category, contraindications, key_interactions,
           common_side_effects, route, renal_adjust, hepatic_adjust, notes, active)
        VALUES
          (${rule_id}, ${complaint_id}, ${diagnosis_id || null}, ${medication_name}, ${med_group},
           ${is_first_line}, ${adult_dose}, ${adult_max_dose}, ${pediatric_dose},
           ${pregnancy_cat}, ${contraind}, ${interactions},
           ${side_effects}, ${route}, ${renal_adjust}, ${hepatic_adjust}, ${notes}, true)
        ON CONFLICT (rule_id) DO UPDATE SET
          diagnosis_id        = EXCLUDED.diagnosis_id,
          medication_name     = EXCLUDED.medication_name,
          medication_group    = EXCLUDED.medication_group,
          is_first_line       = EXCLUDED.is_first_line,
          adult_dose          = EXCLUDED.adult_dose,
          adult_max_dose      = EXCLUDED.adult_max_dose,
          pediatric_dose      = EXCLUDED.pediatric_dose,
          pregnancy_category  = EXCLUDED.pregnancy_category,
          contraindications   = EXCLUDED.contraindications,
          key_interactions    = EXCLUDED.key_interactions,
          common_side_effects = EXCLUDED.common_side_effects,
          route               = EXCLUDED.route,
          renal_adjust        = EXCLUDED.renal_adjust,
          hepatic_adjust      = EXCLUDED.hepatic_adjust,
          notes               = EXCLUDED.notes,
          updated_at          = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS was_insert
      `);
      (res.rows[0] as any)?.was_insert ? inserted++ : updated++;
    } catch { skipped++; }
  }
  return { inserted, updated, skipped };
}

// ─── SECONDARY QUESTIONS — normalized across 7 tabs ─────────────────────────
// All tabs have Question_ID and Question_Text; complaint / diagnosis vary slightly.

interface QSchema {
  qId: number;    // col index of Question_ID
  qText: number;  // col index of Question_Text
  qType?: number; // col index of Question_Type (if present)
  order?: number; // col index of Ask_Order (if present)
  dxId?: number;  // col index of Diagnosis_ID (for complaint_id derivation)
  cc?: number;    // col index of Chief_Complaint
}

const Q_SCHEMAS: Record<string, QSchema> = {
  GI_SECOND:    { qId: 5, qText: 6, qType: 7, order: 8, dxId: 3, cc: 1 },
  ENDO_SECOND:  { qId: 5, qText: 6, qType: 7, order: 8, dxId: 3, cc: 1 },
  DERM_SECOND:  { qId: 5, qText: 6, qType: 7, order: 8, dxId: 0, cc: 2 },
  CARDS_SECOND: { qId: 4, qText: 5, qType: 6, order: 7, dxId: 0, cc: 2 },
  ENV_SECOND:   { qId: 4, qText: 5, qType: 6, order: 7, cc: 1 },
  TOX_SECOND:   { qId: 4, qText: 5, qType: 6, order: 7, cc: 1 },
  UROGYN_SECOND:{ qId: 5, qText: 6, qType: 7, order: 8, dxId: 0, cc: 2 },
};

function mapQuestionType(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("yes") || s.includes("yn") || s.includes("bool")) return "yes_no";
  if (s.includes("select") || s.includes("choice") || s.includes("multi")) return "multi_choice";
  if (s.includes("number") || s.includes("num") || s.includes("int")) return "number";
  if (s.includes("text") || s.includes("free") || s.includes("open")) return "text";
  return "yes_no";
}

async function importSecondaryQuestionsTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<Counts> {
  const schema = Q_SCHEMAS[tab];
  if (!schema) return { inserted: 0, updated: 0, skipped: 0 };

  const rows = await fetchTab(sheets, spreadsheetId, tab);
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows.slice(1)) {
    const question_id = safe(r[schema.qId]);
    const prompt      = safe(r[schema.qText]);
    if (!question_id || !prompt) { skipped++; continue; }

    const rawType    = schema.qType !== undefined ? safe(r[schema.qType]) : "";
    const type       = mapQuestionType(rawType);
    const priority   = schema.order !== undefined ? (parseInt(safe(r[schema.order]), 10) || 50) : 50;
    const dxId       = schema.dxId !== undefined ? safe(r[schema.dxId]) : "";
    const cc         = schema.cc !== undefined ? safe(r[schema.cc]) : "";
    const complaint_id = slugify(cc) || (dxId ? dxId.split("_").slice(0, 2).join("_").toLowerCase() : "general");

    try {
      // kb_questions has no unique constraint on question_id — skip if exists
      const existing = await db.execute(sql`
        SELECT id FROM kb_questions
        WHERE question_id = ${question_id} AND complaint_id = ${complaint_id}
        LIMIT 1
      `);
      if ((existing.rows as any[]).length > 0) { updated++; continue; }

      await db.execute(sql`
        INSERT INTO kb_questions
          (complaint_id, question_id, prompt, type, required, priority, active)
        VALUES
          (${complaint_id}, ${question_id}, ${prompt}, ${type}, false, ${priority}, true)
      `);
      inserted++;
    } catch { skipped++; }
  }
  return { inserted, updated, skipped };
}

// ─── DERM MODIFIERS ──────────────────────────────────────────────────────────
// Headers: Modifier_ID, Modifier_Category, History_Type, Display_Name, Question_Text,
//          Answer_Type, Answer_Options, Age_Min, Age_Max, Active

async function importDermModifiers(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<Counts> {
  const rows = await fetchTab(sheets, spreadsheetId, "DERM_MODIFIERS");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows.slice(1)) {
    const modifier_id = safe(r[0]);
    const label       = safe(r[3]) || modifier_id;
    if (!modifier_id || !label) { skipped++; continue; }

    const description    = safe(r[4]) || safe(r[1]) || null;
    const applies_to_pg  = `{"DERM"}`;
    const active         = safe(r[9]).toUpperCase() !== "N";
    const metadata       = JSON.stringify({
      category:     safe(r[1]) || null,
      history_type: safe(r[2]) || null,
      answer_type:  safe(r[5]) || null,
      options:      safe(r[6]) || null,
      age_min:      safe(r[7]) || null,
      age_max:      safe(r[8]) || null,
    });

    try {
      const res = await db.execute(sql`
        INSERT INTO kb_modifiers
          (modifier_id, label, description, applies_to, add_diagnoses, remove_diagnoses,
           workup_changes, med_changes, active, metadata)
        VALUES
          (${modifier_id}, ${label}, ${description}, ${applies_to_pg}::text[],
           '{}'::text[], '{}'::text[], '{}'::jsonb, '{}'::jsonb,
           ${active}, ${metadata}::jsonb)
        ON CONFLICT (modifier_id) DO UPDATE SET
          label       = EXCLUDED.label,
          description = EXCLUDED.description,
          active      = EXCLUDED.active,
          metadata    = EXCLUDED.metadata,
          updated_at  = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS was_insert
      `);
      (res.rows[0] as any)?.was_insert ? inserted++ : updated++;
    } catch { skipped++; }
  }
  return { inserted, updated, skipped };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export interface ExtendedImportResult {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  totalNewRows: number;
  totalUpdatedRows: number;
  tables: {
    diagnosis_rules:   Counts & { tabs: string[] };
    red_flag_rules:    Counts & { tabs: string[] };
    treatment_rules:   Counts & { tabs: string[] };
    questions:         Counts & { tabs: string[] };
    modifiers:         Counts & { tabs: string[] };
  };
  error?: string;
}

export async function importAllSystemSheetsToDb(): Promise<ExtendedImportResult> {
  const startedAt = new Date().toISOString();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const zeroCounts = (): Counts => ({ inserted: 0, updated: 0, skipped: 0 });
  const add = (a: Counts, b: Counts): Counts => ({
    inserted: a.inserted + b.inserted,
    updated:  a.updated  + b.updated,
    skipped:  a.skipped  + b.skipped,
  });

  try {
    console.log("[ExtendedImport] Starting extended system sheet import from", spreadsheetId);

    // ── 1. Diagnosis tabs (run in batches of 4 to respect rate limits) ────
    const dxTabs = [
      "ENT_DIAGNOSIS_MASTER", "GI_Diagnosis_Master", "Derm_Diagnosis_Master",
      "Cards_Diagnosis_Master", "ENDO_DIAGNOSES_MASTER", "ID_Diagnosis_Master",
      "Pulm_Diagnosis_Master", "Tox_Diagnosis_Master", "UroGyn_Diagnosis_Master",
      "ENV_DIAGNOSIS_MASTER", "GLOBAL_DIAGNOSIS_FINAL",
    ];
    let dxCounts = zeroCounts();
    for (let i = 0; i < dxTabs.length; i += 4) {
      const batch = dxTabs.slice(i, i + 4);
      const results = await Promise.all(batch.map(t => importDiagnosisTab(sheets, spreadsheetId, t)));
      results.forEach(r => { dxCounts = add(dxCounts, r); });
      console.log(`[ExtendedImport] Diagnosis batch ${i/4+1}: +${results.reduce((s,r)=>s+r.inserted,0)} new`);
    }

    // ── 2. Red flag tabs ──────────────────────────────────────────────────
    const rfTabs = ["ENT_RedFlags", "GI_RedFlags", "Derm_RedFlags",
                    "Cards_RedFlags", "Endo_RedFlags", "Env_RedFlags", "Tox_RefFlags"];
    const rfResults = await Promise.all(rfTabs.map(t => importRedFlagTab(sheets, spreadsheetId, t)));
    const rfCounts = rfResults.reduce(add, zeroCounts());
    console.log(`[ExtendedImport] Red flags: +${rfCounts.inserted} new`);

    // ── 3. Medication tabs ────────────────────────────────────────────────
    const medTabsA = ["ENT_Medications_Master", "Derm_Medications_Master", "GLOBAL_MEDICATIONS_FINAL"];
    const medTabsB = ["GI_Medications_Master", "Cards_Medications_Master", "Endo_Medications_Master",
                      "Env_Medications_Master", "Tox_Meds_Master", "UroGyn_Medication_Master", "Pulm_Meds_Master"];
    const [medAResults, medBResults] = await Promise.all([
      Promise.all(medTabsA.map(t => importMedicationsTab(sheets, spreadsheetId, t, true))),
      Promise.all(medTabsB.map(t => importMedicationsTab(sheets, spreadsheetId, t, false))),
    ]);
    const medCounts = [...medAResults, ...medBResults].reduce(add, zeroCounts());
    console.log(`[ExtendedImport] Medications: +${medCounts.inserted} new`);

    // ── 4. Secondary question tabs ────────────────────────────────────────
    const qTabs = ["GI_SECOND","ENDO_SECOND","DERM_SECOND","CARDS_SECOND",
                   "ENV_SECOND","TOX_SECOND","UROGYN_SECOND"];
    const qResults = await Promise.all(qTabs.map(t => importSecondaryQuestionsTab(sheets, spreadsheetId, t)));
    const qCounts = qResults.reduce(add, zeroCounts());
    console.log(`[ExtendedImport] Questions: +${qCounts.inserted} new`);

    // ── 5. Modifiers ──────────────────────────────────────────────────────
    const modCounts = await importDermModifiers(sheets, spreadsheetId);
    console.log(`[ExtendedImport] Modifiers: +${modCounts.inserted} new`);

    const completedAt = new Date().toISOString();
    const totalNewRows = dxCounts.inserted + rfCounts.inserted + medCounts.inserted +
                         qCounts.inserted + modCounts.inserted;
    const totalUpdatedRows = dxCounts.updated + rfCounts.updated + medCounts.updated +
                             qCounts.updated + modCounts.updated;

    console.log(`[ExtendedImport] Complete — ${totalNewRows} new rows, ${totalUpdatedRows} updated`);

    return {
      ok: true,
      startedAt,
      completedAt,
      totalNewRows,
      totalUpdatedRows,
      tables: {
        diagnosis_rules: { ...dxCounts, tabs: dxTabs },
        red_flag_rules:  { ...rfCounts, tabs: rfTabs },
        treatment_rules: { ...medCounts, tabs: [...medTabsA, ...medTabsB] },
        questions:       { ...qCounts,   tabs: qTabs },
        modifiers:       { ...modCounts, tabs: ["DERM_MODIFIERS"] },
      },
    };
  } catch (e: any) {
    const zero = zeroCounts();
    return {
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      totalNewRows: 0,
      totalUpdatedRows: 0,
      tables: {
        diagnosis_rules: { ...zero, tabs: [] },
        red_flag_rules:  { ...zero, tabs: [] },
        treatment_rules: { ...zero, tabs: [] },
        questions:       { ...zero, tabs: [] },
        modifiers:       { ...zero, tabs: [] },
      },
      error: e?.message,
    };
  }
}
