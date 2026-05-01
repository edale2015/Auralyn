/**
 * kbQueryLayer.ts
 * server/retrieval/kbQueryLayer.ts
 *
 * Connects the clinical pipeline to the existing PostgreSQL KB tables.
 * Replaces live Google Sheets reads (Issue 3 fix) with fast DB queries
 * backed by a 5-minute in-memory cache.
 *
 * Actual table schemas (from information_schema):
 *   kb_red_flag_rules   — rule_id, complaint_id, label, trigger_expr, severity, action, active
 *   kb_diagnosis_rules  — rule_id, complaint_id, diagnosis_id, diagnosis_label, cannot_miss, base_probability, active
 *   kb_treatment_rules  — rule_id, complaint_id, diagnosis_id, medication_name, adult_dose, route, contraindications, pregnancy_category, active
 *   kb_disposition_rules — rule_id, complaint_id, priority, when_expr, disposition_level, active
 *   kb_modifiers        — modifier_id, label, applies_to[], disposition_threshold_shift, active
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export interface KBRedFlagRule {
  id:           number;
  rule_id:      string;
  complaint_id: string;
  label:        string;
  trigger_expr: string;
  severity:     string;
  action:       string;
  active:       boolean;
}

export interface KBDiagnosisRule {
  id:               number;
  rule_id:          string;
  complaint_id:     string;
  diagnosis_id:     string;
  diagnosis_label:  string;
  icd_code?:        string;
  base_probability?: number;
  cannot_miss:      boolean;
  base_points?:     number;
  cluster_priority?: number;
  active:           boolean;
}

export interface KBTreatmentRule {
  id:                  number;
  rule_id:             string;
  complaint_id:        string;
  diagnosis_id?:       string;
  medication_name:     string;
  medication_group?:   string;
  is_first_line?:      boolean;
  adult_dose?:         string;
  route?:              string;
  contraindications?:  string;
  pregnancy_category?: string;
  allergy_cross_reacts?: string[];
  active:              boolean;
}

export interface KBDispositionRule {
  id:               number;
  rule_id:          string;
  complaint_id:     string;
  priority:         number;
  when_expr:        string;
  disposition_level: string;
  active:           boolean;
}

export interface KBModifier {
  id:                          number;
  modifier_id:                 string;
  label:                       string;
  applies_to:                  string[];
  disposition_threshold_shift?: number;
  active:                      boolean;
}

export interface PatientContext {
  age?:              number;
  sex?:              "M" | "F" | "other";
  pregnant?:         boolean;
  pmh?:              string[];
  currentMeds?:      string[];
  allergies?:        string[];
  immunocompromised?: boolean;
  diabetic?:         boolean;
  chf?:              boolean;
  copd?:             boolean;
  renalDisease?:     boolean;
  anticoagulated?:   boolean;
}

export interface KBQueryResult {
  complaintId:      string;
  redFlags:         KBRedFlagRule[];
  diagnoses:        KBDiagnosisRule[];
  treatments:       KBTreatmentRule[];
  dispositions:     KBDispositionRule[];
  modifiers:        KBModifier[];
  appliedModifiers: string[];
  rulesFired:       string[];
  mustNotMiss:      KBDiagnosisRule[];
}

// ─── Modifier evaluation ──────────────────────────────────────────────────────

function evaluateModifiers(modifiers: KBModifier[], complaint: string, patient: PatientContext): string[] {
  const fired: string[] = [];

  for (const mod of modifiers) {
    const appliesToComplaint =
      !mod.applies_to?.length ||
      mod.applies_to.some(t => t.toLowerCase() === complaint || t.toLowerCase() === "all");

    if (!appliesToComplaint) continue;

    const label = (mod.label ?? "").toLowerCase();

    if (label.includes("elderly") || label.includes("age>65")) {
      if ((patient.age ?? 0) > 65) { fired.push(mod.modifier_id); continue; }
    }
    if (label.includes("pediatric") || label.includes("age<18")) {
      if ((patient.age ?? 99) < 18) { fired.push(mod.modifier_id); continue; }
    }
    if (label.includes("preg") && patient.pregnant) { fired.push(mod.modifier_id); continue; }
    if (label.includes("immunocompromised") && patient.immunocompromised) { fired.push(mod.modifier_id); continue; }
    if ((label.includes("diabet") || label.includes("dm")) && patient.diabetic) { fired.push(mod.modifier_id); continue; }
    if ((label.includes("chf") || label.includes("heart failure")) && patient.chf) { fired.push(mod.modifier_id); continue; }
    if ((label.includes("copd") || label.includes("emphysema")) && patient.copd) { fired.push(mod.modifier_id); continue; }
    if ((label.includes("renal") || label.includes("ckd")) && patient.renalDisease) { fired.push(mod.modifier_id); continue; }
    if (label.includes("anticoagul") && patient.anticoagulated) { fired.push(mod.modifier_id); continue; }
  }

  return fired;
}

// ─── Medication safety filter ─────────────────────────────────────────────────

function filterSafeMedications(treatments: KBTreatmentRule[], patient: PatientContext): KBTreatmentRule[] {
  return treatments.filter(tx => {
    if (!tx.contraindications && !tx.pregnancy_category) return true;

    const contra = (tx.contraindications ?? "").toLowerCase();
    const pregCat = (tx.pregnancy_category ?? "").toUpperCase();

    if (patient.pregnant && (contra.includes("pregnancy") || contra.includes("pregnant") || ["D","X"].includes(pregCat))) return false;
    if (patient.renalDisease && contra.includes("renal")) return false;
    if ((patient.age ?? 99) < 18 && (contra.includes("pediatric") || contra.includes("child"))) return false;

    if (patient.allergies?.length) {
      const medName = tx.medication_name.toLowerCase();
      for (const allergy of patient.allergies) {
        const a = allergy.toLowerCase();
        if (medName.includes(a)) return false;
        if (a.includes("penicillin") && (medName.includes("amoxicillin") || medName.includes("ampicillin"))) return false;
        if (a.includes("sulfa") && (medName.includes("sulfamethoxazole") || medName.includes("tmp-smx"))) return false;
      }
      if (tx.allergy_cross_reacts?.length) {
        for (const allergy of patient.allergies) {
          if (tx.allergy_cross_reacts.some(cr => cr.toLowerCase().includes(allergy.toLowerCase()))) return false;
        }
      }
    }

    return true;
  });
}

// ─── Main KB query ────────────────────────────────────────────────────────────

export async function queryKBForComplaint(
  complaintId: string,
  patient:     PatientContext = {}
): Promise<KBQueryResult> {

  const c = complaintId.toLowerCase().replace(/\s+/g, "_");

  const [redFlagRows, diagnosisRows, treatmentRows, dispositionRows, modifierRows] = await Promise.all([

    db.execute(sql`
      SELECT id, rule_id, complaint_id, label, trigger_expr, severity, action, active
      FROM kb_red_flag_rules
      WHERE active = true
        AND (LOWER(complaint_id) = ${c} OR LOWER(complaint_id) = 'all' OR complaint_id IS NULL)
      ORDER BY
        CASE WHEN severity = 'CRITICAL' THEN 0 WHEN severity = 'HIGH' THEN 1 ELSE 2 END,
        CASE WHEN LOWER(complaint_id) = ${c} THEN 0 ELSE 1 END
      LIMIT 30
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT id, rule_id, complaint_id, diagnosis_id, diagnosis_label, icd_code,
             base_probability, cannot_miss, base_points, cluster_priority, active
      FROM kb_diagnosis_rules
      WHERE active = true
        AND (LOWER(complaint_id) = ${c} OR LOWER(complaint_id) LIKE ${`%${c}%`})
      ORDER BY
        CASE WHEN cannot_miss = true THEN 0 ELSE 1 END,
        COALESCE(base_probability, 0.5) DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT id, rule_id, complaint_id, diagnosis_id, medication_name, medication_group,
             is_first_line, adult_dose, route, contraindications, pregnancy_category,
             allergy_cross_reacts, active
      FROM kb_treatment_rules
      WHERE active = true
        AND (LOWER(complaint_id) = ${c} OR LOWER(complaint_id) LIKE ${`%${c}%`} OR complaint_id IS NULL)
      ORDER BY COALESCE(is_first_line, false) DESC, medication_name
      LIMIT 20
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT id, rule_id, complaint_id, priority, when_expr, disposition_level, active
      FROM kb_disposition_rules
      WHERE active = true
        AND (LOWER(complaint_id) = ${c} OR LOWER(complaint_id) LIKE ${`%${c}%`})
      ORDER BY priority ASC
      LIMIT 15
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT id, modifier_id, label, applies_to, disposition_threshold_shift, active
      FROM kb_modifiers WHERE active = true LIMIT 100
    `).catch(() => ({ rows: [] })),

  ]);

  const redFlags     = redFlagRows.rows     as unknown as KBRedFlagRule[];
  const diagnoses    = diagnosisRows.rows   as unknown as KBDiagnosisRule[];
  const treatments   = treatmentRows.rows   as unknown as KBTreatmentRule[];
  const dispositions = dispositionRows.rows as unknown as KBDispositionRule[];
  const modifiers    = modifierRows.rows    as unknown as KBModifier[];

  const appliedModifiers  = evaluateModifiers(modifiers, c, patient);
  const safeTreatments    = filterSafeMedications(treatments, patient);
  const mustNotMiss       = diagnoses.filter(d => d.cannot_miss === true);

  const rulesFired = [
    ...redFlags.map(r    => r.rule_id),
    ...diagnoses.map(d   => d.rule_id),
    ...safeTreatments.map(t => t.rule_id),
    ...dispositions.map(d  => d.rule_id),
    ...appliedModifiers,
  ].filter(Boolean);

  return {
    complaintId:     c,
    redFlags,
    diagnoses,
    treatments:      safeTreatments,
    dispositions,
    modifiers:       modifiers.filter(m => appliedModifiers.includes(m.modifier_id)),
    appliedModifiers,
    rulesFired,
    mustNotMiss,
  };
}

// ─── System prompt block builder ──────────────────────────────────────────────

export function buildKBPromptBlock(kb: KBQueryResult): string {
  const lines: string[] = [
    `## CLINICAL KB — ${kb.complaintId.replace(/_/g, " ").toUpperCase()}`,
    `(${kb.rulesFired.length} rules loaded from PostgreSQL KB)`,
    "",
  ];

  if (kb.redFlags.length > 0) {
    lines.push("### RED FLAG RULES (override everything)");
    kb.redFlags.forEach(r => {
      lines.push(`- IF ${r.trigger_expr || r.label} → ${r.action} [${r.severity}]`);
    });
    lines.push("");
  }

  if (kb.mustNotMiss.length > 0) {
    lines.push("### MUST-NOT-MISS DIAGNOSES (cannot_miss = true)");
    kb.mustNotMiss.forEach(d => {
      const prob = d.base_probability ? ` (base p=${d.base_probability.toFixed(2)})` : "";
      lines.push(`- ${d.diagnosis_label}${d.icd_code ? ` [${d.icd_code}]` : ""}${prob} — never dismiss without workup`);
    });
    lines.push("");
  }

  if (kb.diagnoses.length > 0) {
    lines.push("### DIFFERENTIAL DIAGNOSIS RULES");
    kb.diagnoses.filter(d => !d.cannot_miss).forEach(d => {
      const prob = d.base_probability ? ` [p=${d.base_probability.toFixed(2)}]` : "";
      lines.push(`- ${d.diagnosis_label}${d.icd_code ? ` [${d.icd_code}]` : ""}${prob}`);
    });
    lines.push("");
  }

  if (kb.dispositions.length > 0) {
    lines.push("### DISPOSITION RULES (priority ordered)");
    kb.dispositions.forEach(d => {
      lines.push(`- [P${d.priority}] ${d.when_expr} → ${d.disposition_level}`);
    });
    lines.push("");
  }

  if (kb.treatments.length > 0) {
    lines.push("### TREATMENT OPTIONS (pre-filtered for patient safety)");
    kb.treatments.forEach(t => {
      const dose  = t.adult_dose ? ` | ${t.adult_dose}` : "";
      const route = t.route ? ` ${t.route}` : "";
      const first = t.is_first_line ? " ★" : "";
      lines.push(`- ${t.medication_name}${first}${dose}${route}`);
    });
    lines.push("");
  }

  if (kb.appliedModifiers.length > 0) {
    lines.push("### ACTIVE PATIENT MODIFIERS");
    kb.modifiers.forEach(m => {
      const shift = m.disposition_threshold_shift ? ` (disposition threshold shift: ${m.disposition_threshold_shift > 0 ? "+" : ""}${m.disposition_threshold_shift})` : "";
      lines.push(`- ${m.label}${shift}`);
    });
    lines.push("");
  }

  lines.push("### AUDIT TRAIL");
  lines.push(`Rules fired: ${kb.rulesFired.join(", ")}`);

  return lines.join("\n");
}

// ─── 5-minute in-memory cache (fixes Issue 3) ────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  data:     KBQueryResult;
  cachedAt: number;
}

const queryCache = new Map<string, CacheEntry>();

export async function queryKBCached(
  complaintId: string,
  patient:     PatientContext = {}
): Promise<KBQueryResult> {
  const patientKey = [
    patient.age          ? `age${patient.age}` : "",
    patient.pregnant     ? "preg" : "",
    patient.immunocompromised ? "ic" : "",
    patient.diabetic     ? "dm" : "",
    patient.chf          ? "chf" : "",
    patient.copd         ? "copd" : "",
    patient.renalDisease ? "ckd" : "",
    patient.anticoagulated ? "acag" : "",
    patient.allergies?.sort().join("-") ?? "",
  ].filter(Boolean).join(":");

  const cacheKey = `${complaintId}:${patientKey}`;
  const cached   = queryCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const result = await queryKBForComplaint(complaintId, patient);
  queryCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  return result;
}

export function clearKBCache(): void {
  queryCache.clear();
}
