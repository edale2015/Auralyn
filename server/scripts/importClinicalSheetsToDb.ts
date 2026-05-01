/**
 * importClinicalSheetsToDb.ts
 * Reads 6 canonical clinical tabs from the Google Sheet and upserts
 * them into the matching KB tables.  All writes use ON CONFLICT DO UPDATE
 * so the operation is fully idempotent and safe to re-run.
 *
 * Tabs → tables:
 *   COMPLAINT_REGISTRY   → kb_complaints
 *   RED_FLAG_RULES       → kb_red_flag_rules
 *   CLINICAL_DIAGNOSES   → kb_diagnosis_rules
 *   CLINICAL_MEDICATIONS → kb_treatment_rules
 *   CLINICAL_MODIFIERS   → kb_modifiers
 *   DISPOSITION_RULES    → kb_disposition_rules
 */

import { google } from "googleapis";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── helpers ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

function yn(v: unknown): boolean {
  const s = safe(v).toUpperCase();
  return s === "Y" || s === "YES" || s === "TRUE";
}

function safe(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
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

async function fetchTab(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, tab: string): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:AJ`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = (res.data.values ?? []) as string[][];
  return rows;
}

// ─── per-table importers ─────────────────────────────────────────────────────

async function importComplaints(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "COMPLAINT_REGISTRY");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of data) {
    const complaint_id = safe(r[0]);
    const label       = safe(r[1]);
    if (!complaint_id || !label) { skipped++; continue; }

    const enabled      = safe(r[2]).toUpperCase() !== "FALSE";
    const system       = safe(r[3]) || "GENERAL";
    const graph_id     = safe(r[4]) || null;
    const scoring_mod  = safe(r[7]) || null;

    const result = await db.execute(sql`
      INSERT INTO kb_complaints (complaint_id, label, system, enabled, graph_id, scoring_module, metadata)
      VALUES (
        ${complaint_id}, ${label}, ${system}, ${enabled},
        ${graph_id}, ${scoring_mod},
        ${JSON.stringify({ red_flag_set: r[6] ?? null, disposition_set: r[8] ?? null, output_template_set: r[9] ?? null })}::jsonb
      )
      ON CONFLICT (complaint_id) DO UPDATE SET
        label          = EXCLUDED.label,
        system         = EXCLUDED.system,
        enabled        = EXCLUDED.enabled,
        graph_id       = EXCLUDED.graph_id,
        scoring_module = EXCLUDED.scoring_module,
        metadata       = EXCLUDED.metadata,
        updated_at     = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS was_insert
    `);
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

async function importRedFlagRules(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "RED_FLAG_RULES");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of data) {
    const rule_id      = safe(r[1]);
    const complaint_id = safe(r[2]);
    const label        = safe(r[4]) || rule_id;
    const trigger_expr = safe(r[5]);
    if (!rule_id || !complaint_id || !trigger_expr) { skipped++; continue; }

    const severity    = safe(r[3]) || "HARD";
    const action      = safe(r[6]) || "ER_SEND";
    const rationale   = safe(r[8]) || null;

    const result = await db.execute(sql`
      INSERT INTO kb_red_flag_rules
        (rule_id, complaint_id, label, trigger_expr, severity, action, rationale, active)
      VALUES
        (${rule_id}, ${complaint_id}, ${label}, ${trigger_expr}, ${severity}, ${action}, ${rationale}, true)
      ON CONFLICT (rule_id) DO UPDATE SET
        complaint_id = EXCLUDED.complaint_id,
        label        = EXCLUDED.label,
        trigger_expr = EXCLUDED.trigger_expr,
        severity     = EXCLUDED.severity,
        action       = EXCLUDED.action,
        rationale    = EXCLUDED.rationale,
        updated_at   = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS was_insert
    `);
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

async function importDiagnosisRules(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "CLINICAL_DIAGNOSES");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of data) {
    const diagnosis_id    = safe(r[0]);
    const complaint_raw   = safe(r[2]);
    const diagnosis_label = safe(r[3]);
    if (!diagnosis_id || !diagnosis_label) { skipped++; continue; }

    const rule_id      = diagnosis_id;
    const complaint_id = slugify(complaint_raw) || slugify(safe(r[1]) + "_" + diagnosis_id);
    const cannot_miss  = yn(r[9]);
    const active       = safe(r[31]).toUpperCase() === "Y" || safe(r[31]) === "";

    const feature_likelihoods = {
      severity:             safe(r[7])  || null,
      diagnostic_criteria:  safe(r[8])  || null,
      red_flag_criteria:    safe(r[10]) || null,
      key_modifiers:        safe(r[11]) || null,
      exam_findings:        safe(r[13]) || null,
      imaging:              safe(r[14]) || null,
      labs:                 safe(r[15]) || null,
      disposition:          safe(r[16]) || null,
      default_triage:       safe(r[18]) || null,
      treatment_first_line: safe(r[23]) || null,
      treatment_alt:        safe(r[24]) || null,
      supportive_care:      safe(r[25]) || null,
      follow_up:            safe(r[22]) || null,
      pediatric_variant:    safe(r[26]) || null,
    };

    const result = await db.execute(sql`
      INSERT INTO kb_diagnosis_rules
        (rule_id, complaint_id, diagnosis_id, diagnosis_label, cannot_miss, feature_likelihoods, active)
      VALUES
        (${rule_id}, ${complaint_id}, ${diagnosis_id}, ${diagnosis_label}, ${cannot_miss},
         ${JSON.stringify(feature_likelihoods)}::jsonb, ${active})
      ON CONFLICT (rule_id) DO UPDATE SET
        complaint_id        = EXCLUDED.complaint_id,
        diagnosis_label     = EXCLUDED.diagnosis_label,
        cannot_miss         = EXCLUDED.cannot_miss,
        feature_likelihoods = EXCLUDED.feature_likelihoods,
        active              = EXCLUDED.active,
        updated_at          = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS was_insert
    `);
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

async function importTreatmentRules(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "CLINICAL_MEDICATIONS");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;
  const seen = new Set<string>();

  for (const r of data) {
    const diagnosis_id   = safe(r[0]);
    const medication_name = safe(r[2]);
    if (!medication_name) { skipped++; continue; }

    const base = slugify(`MED_${medication_name}_${diagnosis_id}`).slice(0, 120);
    let rule_id = base;
    let suffix = 1;
    while (seen.has(rule_id)) { rule_id = `${base}_${++suffix}`; }
    seen.add(rule_id);

    const complaint_id   = diagnosis_id ? diagnosis_id.split("_").slice(0, 2).join("_").toLowerCase() : null;
    const is_first_line  = yn(r[5]);
    const adult_dose     = safe(r[6]) || null;
    const adult_max_dose = safe(r[7]) || null;
    const pediatric_dose = safe(r[8]) || null;
    const pregnancy_cat  = safe(r[9]) || null;
    const contraind      = safe(r[10]) || null;
    const interactions   = safe(r[11]) || null;
    const side_effects   = safe(r[12]) || null;
    const route          = safe(r[13]) || null;
    const renal_adjust   = yn(r[14]) ? "Yes" : (safe(r[14]) || null);
    const hepatic_adjust = yn(r[15]) ? "Yes" : (safe(r[15]) || null);
    const notes          = safe(r[16]) || null;
    const med_group      = safe(r[3]) || null;

    const result = await db.execute(sql`
      INSERT INTO kb_treatment_rules
        (rule_id, complaint_id, diagnosis_id, medication_name, medication_group,
         is_first_line, adult_dose, adult_max_dose, pediatric_dose,
         pregnancy_category, contraindications, key_interactions,
         common_side_effects, route, renal_adjust, hepatic_adjust, notes, active)
      VALUES
        (${rule_id}, ${complaint_id}, ${diagnosis_id}, ${medication_name}, ${med_group},
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
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

async function importModifiers(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "CLINICAL_MODIFIERS");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of data) {
    const modifier_id = safe(r[0]);
    const label       = safe(r[1]);
    if (!modifier_id || !label) { skipped++; continue; }

    const description = safe(r[10]) || safe(r[2]) || null;
    const scope       = safe(r[9]) || "global";
    const applies_to  = scope === "global" ? ["global"] : [scope];
    const active      = yn(r[12]);

    const metadata = {
      category:       safe(r[2]) || null,
      data_type:      safe(r[3]) || null,
      required:       yn(r[4]),
      default_value:  safe(r[5]) || null,
      choices:        safe(r[6]) || null,
      allows_multiple: yn(r[7]),
      phi_sensitivity: safe(r[8]) || "low",
      examples:       safe(r[11]) || null,
    };

    const applies_to_pg = `{${applies_to.map(x => `"${x.replace(/"/g, '\\"')}"`).join(",")}}`;

    const result = await db.execute(sql`
      INSERT INTO kb_modifiers
        (modifier_id, label, description, applies_to, add_diagnoses, remove_diagnoses,
         workup_changes, med_changes, active, metadata)
      VALUES
        (${modifier_id}, ${label}, ${description}, ${applies_to_pg}::text[],
         '{}'::text[], '{}'::text[], '{}'::jsonb, '{}'::jsonb,
         ${active}, ${JSON.stringify(metadata)}::jsonb)
      ON CONFLICT (modifier_id) DO UPDATE SET
        label       = EXCLUDED.label,
        description = EXCLUDED.description,
        applies_to  = EXCLUDED.applies_to,
        active      = EXCLUDED.active,
        metadata    = EXCLUDED.metadata,
        updated_at  = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS was_insert
    `);
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

async function importDispositionRules(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const rows = await fetchTab(sheets, spreadsheetId, "DISPOSITION_RULES");
  if (rows.length < 2) return { inserted: 0, updated: 0, skipped: 0 };
  const [, ...data] = rows;
  let inserted = 0, updated = 0, skipped = 0;

  for (const r of data) {
    const rule_id           = safe(r[1]);
    const complaint_id      = safe(r[2]);
    const when_expr         = safe(r[4]);
    const disposition_level = safe(r[5]);
    if (!rule_id || !complaint_id || !when_expr || !disposition_level) { skipped++; continue; }

    const priority            = parseInt(safe(r[3]), 10) || 50;
    const rationale_template  = safe(r[6]) || null;
    const confidence_hint     = safe(r[7]) || "MODERATE";

    const result = await db.execute(sql`
      INSERT INTO kb_disposition_rules
        (rule_id, complaint_id, priority, when_expr, disposition_level,
         rationale_template_id, confidence_hint, active)
      VALUES
        (${rule_id}, ${complaint_id}, ${priority}, ${when_expr}, ${disposition_level},
         ${rationale_template}, ${confidence_hint}, true)
      ON CONFLICT (rule_id) DO UPDATE SET
        complaint_id          = EXCLUDED.complaint_id,
        priority              = EXCLUDED.priority,
        when_expr             = EXCLUDED.when_expr,
        disposition_level     = EXCLUDED.disposition_level,
        rationale_template_id = EXCLUDED.rationale_template_id,
        confidence_hint       = EXCLUDED.confidence_hint,
        updated_at            = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS was_insert
    `);
    const wasInsert = (result.rows[0] as any)?.was_insert;
    wasInsert ? inserted++ : updated++;
  }
  return { inserted, updated, skipped };
}

// ─── main export ─────────────────────────────────────────────────────────────

export interface ImportClinicalResult {
  ok: boolean;
  spreadsheetId: string;
  startedAt: string;
  completedAt: string;
  tables: {
    complaints:       { inserted: number; updated: number; skipped: number };
    redFlagRules:     { inserted: number; updated: number; skipped: number };
    diagnosisRules:   { inserted: number; updated: number; skipped: number };
    treatmentRules:   { inserted: number; updated: number; skipped: number };
    modifiers:        { inserted: number; updated: number; skipped: number };
    dispositionRules: { inserted: number; updated: number; skipped: number };
  };
  totalRows: number;
  error?: string;
}

export async function importClinicalSheetsToDb(): Promise<ImportClinicalResult> {
  const startedAt = new Date().toISOString();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  try {
    console.log("[SheetImport] Starting clinical sheet import from", spreadsheetId);

    const [complaints, redFlagRules, diagnosisRules, treatmentRules, modifiers, dispositionRules] =
      await Promise.all([
        importComplaints(sheets, spreadsheetId),
        importRedFlagRules(sheets, spreadsheetId),
        importDiagnosisRules(sheets, spreadsheetId),
        importTreatmentRules(sheets, spreadsheetId),
        importModifiers(sheets, spreadsheetId),
        importDispositionRules(sheets, spreadsheetId),
      ]);

    const tables = { complaints, redFlagRules, diagnosisRules, treatmentRules, modifiers, dispositionRules };
    const totalRows = Object.values(tables).reduce((s, t) => s + t.inserted + t.updated, 0);
    const completedAt = new Date().toISOString();

    console.log("[SheetImport] Done. Total rows affected:", totalRows);
    Object.entries(tables).forEach(([k, v]) =>
      console.log(`  ${k}: +${v.inserted} new, ~${v.updated} updated, ${v.skipped} skipped`)
    );

    return { ok: true, spreadsheetId, startedAt, completedAt, tables, totalRows };
  } catch (e: any) {
    console.error("[SheetImport] Error:", e?.message);
    return {
      ok: false,
      spreadsheetId,
      startedAt,
      completedAt: new Date().toISOString(),
      tables: {
        complaints:       { inserted: 0, updated: 0, skipped: 0 },
        redFlagRules:     { inserted: 0, updated: 0, skipped: 0 },
        diagnosisRules:   { inserted: 0, updated: 0, skipped: 0 },
        treatmentRules:   { inserted: 0, updated: 0, skipped: 0 },
        modifiers:        { inserted: 0, updated: 0, skipped: 0 },
        dispositionRules: { inserted: 0, updated: 0, skipped: 0 },
      },
      totalRows: 0,
      error: e?.message,
    };
  }
}
