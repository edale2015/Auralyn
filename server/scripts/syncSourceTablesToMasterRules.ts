/**
 * syncSourceTablesToMasterRules.ts
 *
 * One-direction sync: source KB tables → kb_master_rules (unified pipeline table).
 * Safe to re-run at any time — uses ON CONFLICT (rule_id) DO UPDATE.
 *
 * Tables synced:
 *   kb_questions        → rule_type = 'question'
 *   kb_modifiers        → rule_type = 'modifier'   (global: complaint_id = 'ALL')
 *   kb_red_flag_rules   → rule_type = 'red_flag'
 *   kb_diagnosis_rules  → rule_type = 'diagnosis'
 *   kb_treatment_rules  → rule_type = 'medication'
 *   kb_disposition_rules→ rule_type = 'disposition'
 *   kb_workup_rules     → rule_type = 'workup'
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface SyncResult {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  tables: Record<string, { upserted: number; errors: number }>;
  totalUpserted: number;
  error?: string;
}

// ─── disposition code normaliser ─────────────────────────────────────────────

function normaliseDisposition(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, "_");
  const map: Record<string, string> = {
    ER_SEND: "ER_NOW", ER_NOW: "ER_NOW",
    ED_SEND: "ED_NOW", ED_NOW: "ED_NOW",
    CALL_911: "CALL_911",
    URGENT_CARE: "URGENT_CARE", URGENT: "URGENT_CARE",
    ADMIT: "ADMIT", ADMISSION: "ADMIT",
    TELEMEDICINE: "TELEMEDICINE", TELEHEALTH: "TELEMEDICINE",
    HOME_CARE: "HOME_CARE", HOME: "HOME_CARE", SELF_CARE: "HOME_CARE",
    FOLLOW_UP_48H: "FOLLOW_UP_48H", FOLLOW_UP: "FOLLOW_UP_48H",
    FOLLOW_UP_72H: "FOLLOW_UP_72H",
  };
  for (const [k, v] of Object.entries(map)) {
    if (s.includes(k)) return v;
  }
  return null;
}

function pgArr(arr: string[]): string {
  if (!arr || arr.length === 0) return "'{}'";
  const escaped = arr.map(x => `"${String(x).replace(/"/g, '\\"')}"`);
  return `'{${escaped.join(",")}}'`;
}

// ─── 1. kb_questions ──────────────────────────────────────────────────────────

async function syncQuestions(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_questions WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId       = `MR_Q_${String(r.question_id ?? r.id).toUpperCase()}`;
      const safetyLevel  = ["safety","critical","emergency"].includes((r.category ?? "").toLowerCase())
                           ? "HIGH" : "LOW";
      const catLabel     = r.category ? ` [${r.category}]` : "";
      const ruleName     = `Q: ${String(r.prompt ?? "").slice(0, 200)}`;
      const logicDesc    = `${r.prompt ?? ""}${catLabel}`;
      const qDep         = pgArr([String(r.question_id ?? r.id)]);

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          logic_description, logic_type,
          question_dependencies, input_fields,
          safety_level, confidence_weight,
          active, version, owner, notes
        ) VALUES (
          ${ruleId},
          ${ruleName},
          'question',
          ${r.priority ?? 50},
          ${r.complaint_id ?? null},
          ${logicDesc},
          'boolean',
          ${sql.raw(qDep)}::text[],
          ${sql.raw(qDep)}::text[],
          ${safetyLevel},
          0.5,
          ${r.active ?? true},
          '1.0',
          'sheet_sync',
          ${r.category ?? null}
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name            = EXCLUDED.rule_name,
          priority             = EXCLUDED.priority,
          complaint_id         = EXCLUDED.complaint_id,
          logic_description    = EXCLUDED.logic_description,
          question_dependencies= EXCLUDED.question_dependencies,
          input_fields         = EXCLUDED.input_fields,
          safety_level         = EXCLUDED.safety_level,
          active               = EXCLUDED.active,
          last_updated         = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 2. kb_modifiers ─────────────────────────────────────────────────────────

async function syncModifiers(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_modifiers WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId      = `MR_MOD_${String(r.modifier_id ?? r.id).toUpperCase()}`;
      const shift       = Number(r.disposition_threshold_shift ?? 0);
      const safetyLevel = shift <= -0.2 ? "HIGH" : "MODERATE";

      const outputs = JSON.stringify({
        modifier_id:    r.modifier_id,
        add_diagnoses:  r.add_diagnoses ?? [],
        remove_diagnoses: r.remove_diagnoses ?? [],
        workup_changes: r.workup_changes ?? {},
        med_changes:    r.med_changes ?? {},
        disposition_threshold_shift: shift,
      });

      const metadata: Record<string, any> = r.metadata ?? {};
      const notes = [
        r.description ?? "",
        metadata.category ? `Category: ${metadata.category}` : "",
        metadata.data_type ? `Type: ${metadata.data_type}` : "",
        metadata.choices ? `Options: ${metadata.choices}` : "",
      ].filter(Boolean).join(" | ");

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          logic_description, logic_type,
          outputs, safety_level, confidence_weight,
          active, version, owner, notes
        ) VALUES (
          ${ruleId},
          ${r.label ?? r.modifier_id},
          'modifier',
          20,
          'ALL',
          ${r.description ?? r.label ?? ""},
          'mapping',
          ${outputs}::jsonb,
          ${safetyLevel},
          0.6,
          ${r.active ?? true},
          '1.0',
          'sheet_sync',
          ${notes.slice(0, 500)}
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name         = EXCLUDED.rule_name,
          logic_description = EXCLUDED.logic_description,
          outputs           = EXCLUDED.outputs,
          safety_level      = EXCLUDED.safety_level,
          active            = EXCLUDED.active,
          notes             = EXCLUDED.notes,
          last_updated      = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 3. kb_red_flag_rules ────────────────────────────────────────────────────

async function syncRedFlags(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_red_flag_rules WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId       = `MR_RF_${String(r.rule_id ?? r.id).toUpperCase()}`;
      const isHard       = String(r.severity ?? "").toUpperCase() === "HARD";
      const safetyLevel  = isHard ? "CRITICAL" : "HIGH";
      const disposition  = normaliseDisposition(r.action) ?? (isHard ? "ER_NOW" : "URGENT_CARE");
      const logicDesc    = [r.trigger_expr, r.rationale].filter(Boolean).join(" → ");
      const outputs      = JSON.stringify({
        escalation:        r.action,
        immediate_actions: r.immediate_actions ?? null,
        rationale:         r.rationale ?? null,
      });

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          logic_description, logic_type,
          outputs, disposition_impact,
          safety_level, confidence_weight,
          active, version, owner, notes
        ) VALUES (
          ${ruleId},
          ${r.label ?? r.rule_id},
          'red_flag',
          ${isHard ? 1 : 5},
          ${r.complaint_id ?? null},
          ${logicDesc.slice(0, 1000)},
          'boolean',
          ${outputs}::jsonb,
          ${disposition},
          ${safetyLevel},
          0.95,
          ${r.active ?? true},
          '1.0',
          'sheet_sync',
          ${r.rationale ?? null}
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name         = EXCLUDED.rule_name,
          complaint_id      = EXCLUDED.complaint_id,
          logic_description = EXCLUDED.logic_description,
          outputs           = EXCLUDED.outputs,
          disposition_impact= EXCLUDED.disposition_impact,
          safety_level      = EXCLUDED.safety_level,
          active            = EXCLUDED.active,
          last_updated      = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 4. kb_diagnosis_rules ───────────────────────────────────────────────────

async function syncDiagnoses(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_diagnosis_rules WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId       = `MR_DX_${String(r.rule_id ?? r.id).toUpperCase()}`;
      const safetyLevel  = r.cannot_miss ? "CRITICAL" : "MODERATE";
      const prob         = Number(r.base_probability ?? 0.3);
      const icdNote      = r.icd_code ? ` (ICD: ${r.icd_code})` : "";
      const logicDesc    = `${r.diagnosis_label ?? r.diagnosis_id}${icdNote} — base probability: ${prob}`;
      const outputs      = JSON.stringify({
        diagnosis_id:    r.diagnosis_id,
        diagnosis_label: r.diagnosis_label,
        icd_code:        r.icd_code ?? null,
        base_probability:prob,
        cannot_miss:     r.cannot_miss ?? false,
      });

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          diagnosis_id,
          logic_description, logic_type,
          outputs, safety_level, confidence_weight,
          active, version, owner
        ) VALUES (
          ${ruleId},
          ${(r.diagnosis_label ?? r.diagnosis_id ?? "Unknown").slice(0, 300)},
          'diagnosis',
          ${r.cluster_priority ?? r.base_points ?? 50},
          ${r.complaint_id ?? null},
          ${r.diagnosis_id ?? null},
          ${logicDesc.slice(0, 1000)},
          'scoring',
          ${outputs}::jsonb,
          ${safetyLevel},
          ${Math.min(1, Math.max(0, prob))},
          ${r.active ?? true},
          '1.0',
          'sheet_sync'
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name         = EXCLUDED.rule_name,
          complaint_id      = EXCLUDED.complaint_id,
          diagnosis_id      = EXCLUDED.diagnosis_id,
          logic_description = EXCLUDED.logic_description,
          outputs           = EXCLUDED.outputs,
          safety_level      = EXCLUDED.safety_level,
          confidence_weight = EXCLUDED.confidence_weight,
          active            = EXCLUDED.active,
          last_updated      = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 5. kb_treatment_rules ───────────────────────────────────────────────────

async function syncMedications(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_treatment_rules WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId      = `MR_TX_${String(r.rule_id ?? r.id).toUpperCase()}`;
      const pregCat     = String(r.pregnancy_category ?? "").toUpperCase();
      const safetyLevel = ["X","D"].includes(pregCat) ? "CRITICAL"
                        : r.contraindications ? "HIGH"
                        : "MODERATE";
      const logicDesc   = [
        r.medication_group, r.adult_dose, r.route
      ].filter(Boolean).join(" | ");

      const contraindList = r.contraindications
        ? r.contraindications.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const modDeps       = contraindList.map((c: string) => `no_allergy_${c.toLowerCase().replace(/\s+/g,'_')}`);

      const outputs = JSON.stringify({
        medication_name:  r.medication_name,
        medication_group: r.medication_group ?? null,
        adult_dose:       r.adult_dose ?? null,
        pediatric_dose:   r.pediatric_dose ?? null,
        route:            r.route ?? null,
        pregnancy_category: r.pregnancy_category ?? null,
        contraindications:  r.contraindications ?? null,
        key_interactions:   r.key_interactions ?? null,
        is_first_line:      r.is_first_line ?? false,
      });

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          diagnosis_id, logic_description, logic_type,
          modifier_dependencies,
          outputs, medication_impact,
          safety_level, confidence_weight,
          active, version, owner, notes
        ) VALUES (
          ${ruleId},
          ${(r.medication_name ?? "Unknown").slice(0, 300)},
          'medication',
          ${r.is_first_line ? 10 : 30},
          ${r.complaint_id ?? null},
          ${r.diagnosis_id ?? null},
          ${logicDesc.slice(0, 500)},
          'mapping',
          ${sql.raw(pgArr(modDeps))}::text[],
          ${outputs}::jsonb,
          ${r.adult_dose ?? null},
          ${safetyLevel},
          ${r.is_first_line ? 0.8 : 0.5},
          ${r.active ?? true},
          '1.0',
          'sheet_sync',
          ${r.notes ?? null}
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name            = EXCLUDED.rule_name,
          complaint_id         = EXCLUDED.complaint_id,
          logic_description    = EXCLUDED.logic_description,
          modifier_dependencies= EXCLUDED.modifier_dependencies,
          outputs              = EXCLUDED.outputs,
          medication_impact    = EXCLUDED.medication_impact,
          safety_level         = EXCLUDED.safety_level,
          active               = EXCLUDED.active,
          last_updated         = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 6. kb_disposition_rules ─────────────────────────────────────────────────

async function syncDispositions(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_disposition_rules WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId     = `MR_DISP_${String(r.rule_id ?? r.id).toUpperCase()}`;
      const disposition = normaliseDisposition(r.disposition_level);
      const hint        = String(r.confidence_hint ?? "MODERATE").toUpperCase();
      const safetyLevel = ["HIGH","CRITICAL"].includes(hint) ? hint : "MODERATE";

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          logic_description, logic_type,
          disposition_impact, safety_level, confidence_weight,
          active, version, owner
        ) VALUES (
          ${ruleId},
          ${`Disposition: ${r.disposition_level ?? "unknown"} — ${r.complaint_id ?? "global"}`},
          'disposition',
          ${r.priority ?? 50},
          ${r.complaint_id ?? null},
          ${(r.when_expr ?? "").slice(0, 1000)},
          'conditional',
          ${disposition},
          ${safetyLevel},
          ${hint === "HIGH" ? 0.8 : hint === "CRITICAL" ? 0.95 : 0.5},
          ${r.active ?? true},
          '1.0',
          'sheet_sync'
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name         = EXCLUDED.rule_name,
          complaint_id      = EXCLUDED.complaint_id,
          logic_description = EXCLUDED.logic_description,
          disposition_impact= EXCLUDED.disposition_impact,
          safety_level      = EXCLUDED.safety_level,
          active            = EXCLUDED.active,
          last_updated      = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── 7. kb_workup_rules ──────────────────────────────────────────────────────

async function syncWorkups(): Promise<{ upserted: number; errors: number }> {
  const { rows } = await db.execute(sql`SELECT * FROM kb_workup_rules WHERE active = true`);
  let upserted = 0, errors = 0;

  for (const r of rows as any[]) {
    try {
      const ruleId   = `MR_WU_${String(r.rule_id ?? r.id).toUpperCase()}`;
      const outputs  = JSON.stringify({
        test_name: r.test_name,
        test_type: r.test_type ?? null,
        rationale: r.rationale ?? null,
      });

      await db.execute(sql`
        INSERT INTO kb_master_rules (
          rule_id, rule_name, rule_type, priority, complaint_id,
          logic_description, logic_type,
          outputs, workup_impact,
          safety_level, confidence_weight,
          active, version, owner, notes
        ) VALUES (
          ${ruleId},
          ${r.test_name ?? r.rule_id},
          'workup',
          ${r.priority ?? 50},
          ${r.complaint_id ?? null},
          ${(r.trigger_expr ?? r.rationale ?? "").slice(0, 500)},
          'boolean',
          ${outputs}::jsonb,
          ${[r.test_name, r.test_type].filter(Boolean).join(" - ")},
          'MODERATE',
          0.7,
          ${r.active ?? true},
          '1.0',
          'sheet_sync',
          ${r.rationale ?? null}
        )
        ON CONFLICT (rule_id) DO UPDATE SET
          rule_name         = EXCLUDED.rule_name,
          complaint_id      = EXCLUDED.complaint_id,
          logic_description = EXCLUDED.logic_description,
          outputs           = EXCLUDED.outputs,
          workup_impact     = EXCLUDED.workup_impact,
          active            = EXCLUDED.active,
          last_updated      = NOW()
      `);
      upserted++;
    } catch { errors++; }
  }
  return { upserted, errors };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function syncSourceTablesToMasterRules(): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const tables: Record<string, { upserted: number; errors: number }> = {};

  try {
    console.log("[MasterRuleSync] Starting sync from all source tables...");

    const [questions, modifiers, redFlags, diagnoses, medications, dispositions, workups] =
      await Promise.all([
        syncQuestions(),
        syncModifiers(),
        syncRedFlags(),
        syncDiagnoses(),
        syncMedications(),
        syncDispositions(),
        syncWorkups(),
      ]);

    tables.questions    = questions;
    tables.modifiers    = modifiers;
    tables.redFlags     = redFlags;
    tables.diagnoses    = diagnoses;
    tables.medications  = medications;
    tables.dispositions = dispositions;
    tables.workups      = workups;

    const totalUpserted = Object.values(tables).reduce((s, t) => s + t.upserted, 0);
    const completedAt   = new Date().toISOString();

    console.log("[MasterRuleSync] Done. Total upserted:", totalUpserted);
    Object.entries(tables).forEach(([k, v]) =>
      console.log(`  ${k}: ${v.upserted} upserted, ${v.errors} errors`)
    );

    return { ok: true, startedAt, completedAt, tables, totalUpserted };
  } catch (e: any) {
    console.error("[MasterRuleSync] Fatal error:", e?.message);
    return {
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      tables,
      totalUpserted: 0,
      error: e?.message,
    };
  }
}
