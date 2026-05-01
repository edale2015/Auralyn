/**
 * kbQueryLayer.ts
 * server/retrieval/kbQueryLayer.ts
 *
 * Connects the clinical pipeline to the existing PostgreSQL KB tables.
 * Replaces the live Google Sheets reads for Group D tabs (Issue 3 fix):
 *   CLINICAL_QUESTIONS  → kb_questions (via sheetFlowLoader)
 *   CLINICAL_RULES      → kb_red_flag_rules (via entFluRuleLoader)
 *   CLINICAL_MEDICATIONS → kb_treatment_rules (via medCatalog)
 *   CLINICAL_DIAGNOSES  → kb_diagnosis_rules (via diagnosisCatalog)
 *
 * Queried tables (total ~4,207 rules):
 *   kb_red_flag_rules   — 418 rows
 *   kb_diagnosis_rules  — 2,198 rows
 *   kb_treatment_rules  — 1,227 rows
 *   kb_disposition_rules — 364 rows
 *   kb_modifiers        — patient context rules
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export interface KBRedFlagRule {
  id:              string;
  rule_id?:        string;
  complaint_id:    string;
  system?:         string;
  condition_text:  string;
  action_text:     string;
  severity:        "CRITICAL" | "HIGH" | "MODERATE";
  source_tab?:     string;
  active:          boolean;
}

export interface KBDiagnosisRule {
  id:              string;
  diagnosis_id?:   string;
  system:          string;
  chief_complaint: string;
  diagnosis_name:  string;
  red_flag:        boolean;
  cluster_id?:     string;
  confidence_weight?: number;
  disposition_default?: string;
  active:          boolean;
}

export interface KBTreatmentRule {
  id:              string;
  med_group_id?:   string;
  diagnosis_id?:   string;
  complaint_id?:   string;
  medication_name: string;
  dose?:           string;
  route?:          string;
  duration?:       string;
  contraindications?: string;
  active:          boolean;
}

export interface KBDispositionRule {
  id:              string;
  rule_id?:        string;
  complaint_id:    string;
  cluster_id?:     string;
  diagnosis_id?:   string;
  disposition:     string;
  criteria:        string;
  priority:        number;
  active:          boolean;
}

export interface KBModifier {
  id:              string;
  modifier_id?:    string;
  modifier_type:   string;
  condition:       string;
  affects:         string;
  adjustment:      string;
  active:          boolean;
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

function evaluateModifiers(modifiers: KBModifier[], patient: PatientContext): string[] {
  const fired: string[] = [];

  for (const mod of modifiers) {
    const c = mod.condition.toLowerCase();

    if (c.includes("age>65")    && (patient.age ?? 0) > 65)    { fired.push(mod.id); continue; }
    if (c.includes("age<18")    && (patient.age ?? 99) < 18)   { fired.push(mod.id); continue; }
    if (c.includes("pregnancy") && patient.pregnant)            { fired.push(mod.id); continue; }
    if (c.includes("immunocompromised") && patient.immunocompromised) { fired.push(mod.id); continue; }
    if (c.includes("diabetes")  && patient.diabetic)            { fired.push(mod.id); continue; }
    if (c.includes("chf")       && patient.chf)                 { fired.push(mod.id); continue; }
    if (c.includes("copd")      && patient.copd)                { fired.push(mod.id); continue; }
    if (c.includes("renal")     && patient.renalDisease)        { fired.push(mod.id); continue; }
    if (c.includes("anticoagul") && patient.anticoagulated)     { fired.push(mod.id); continue; }

    if (patient.allergies?.length && c.includes("allergy")) {
      const allergyMed = mod.condition.match(/allergy[_\s](\w+)/i)?.[1]?.toLowerCase();
      if (allergyMed && patient.allergies.some(a => a.toLowerCase().includes(allergyMed))) {
        fired.push(mod.id);
      }
    }
  }

  return fired;
}

function filterSafeMedications(
  treatments:  KBTreatmentRule[],
  patient:     PatientContext,
): KBTreatmentRule[] {
  return treatments.filter(tx => {
    if (!tx.contraindications) return true;
    const contra = tx.contraindications.toLowerCase();

    if (patient.pregnant      && (contra.includes("pregnancy") || contra.includes("pregnant"))) return false;
    if (patient.renalDisease  && contra.includes("renal"))       return false;
    if ((patient.age ?? 99) < 18 && (contra.includes("pediatric") || contra.includes("child"))) return false;

    if (patient.allergies?.length) {
      const medName = tx.medication_name.toLowerCase();
      for (const allergy of patient.allergies) {
        const a = allergy.toLowerCase();
        if (medName.includes(a)) return false;
        if (a.includes("penicillin") && (medName.includes("amoxicillin") || medName.includes("ampicillin"))) return false;
        if (a.includes("sulfa") && (medName.includes("sulfamethoxazole") || medName.includes("tmp-smx"))) return false;
      }
    }

    return true;
  });
}

export async function queryKBForComplaint(
  complaintId: string,
  patient:     PatientContext = {}
): Promise<KBQueryResult> {

  const normalizedComplaint = complaintId.toLowerCase().replace(/\s+/g, "_");

  const [redFlagRows, diagnosisRows, treatmentRows, dispositionRows, modifierRows] = await Promise.all([

    db.execute(sql`
      SELECT *
      FROM kb_red_flag_rules
      WHERE active = true
        AND (
          LOWER(complaint_id) = ${normalizedComplaint}
          OR LOWER(complaint_id) = 'all'
          OR complaint_id IS NULL
        )
      ORDER BY
        CASE WHEN LOWER(complaint_id) = ${normalizedComplaint} THEN 0 ELSE 1 END,
        id
      LIMIT 30
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT *
      FROM kb_diagnosis_rules
      WHERE active = true
        AND (
          LOWER(chief_complaint) = ${normalizedComplaint}
          OR LOWER(chief_complaint) LIKE ${`%${normalizedComplaint}%`}
        )
      ORDER BY
        CASE WHEN red_flag = true THEN 0 ELSE 1 END,
        COALESCE(confidence_weight, 0.5) DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT *
      FROM kb_treatment_rules
      WHERE active = true
        AND (
          LOWER(complaint_id) = ${normalizedComplaint}
          OR LOWER(complaint_id) LIKE ${`%${normalizedComplaint}%`}
          OR complaint_id IS NULL
        )
      ORDER BY id
      LIMIT 20
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT *
      FROM kb_disposition_rules
      WHERE active = true
        AND (
          LOWER(complaint_id) = ${normalizedComplaint}
          OR LOWER(complaint_id) LIKE ${`%${normalizedComplaint}%`}
        )
      ORDER BY priority ASC
      LIMIT 15
    `).catch(() => ({ rows: [] })),

    db.execute(sql`
      SELECT * FROM kb_modifiers WHERE active = true LIMIT 100
    `).catch(() => ({ rows: [] })),

  ]);

  const redFlags     = redFlagRows.rows     as unknown as KBRedFlagRule[];
  const diagnoses    = diagnosisRows.rows   as unknown as KBDiagnosisRule[];
  const treatments   = treatmentRows.rows   as unknown as KBTreatmentRule[];
  const dispositions = dispositionRows.rows as unknown as KBDispositionRule[];
  const modifiers    = modifierRows.rows    as unknown as KBModifier[];

  const appliedModifiers  = evaluateModifiers(modifiers, patient);
  const safeTreatments    = filterSafeMedications(treatments, patient);
  const mustNotMiss       = diagnoses.filter(d => d.red_flag === true);

  const rulesFired = [
    ...redFlags.map(r => r.rule_id ?? r.id),
    ...diagnoses.map(d => d.diagnosis_id ?? d.id),
    ...safeTreatments.map(t => t.med_group_id ?? t.id),
    ...dispositions.map(d => d.rule_id ?? d.id),
    ...appliedModifiers,
  ].filter(Boolean);

  return {
    complaintId:     normalizedComplaint,
    redFlags,
    diagnoses,
    treatments:      safeTreatments,
    dispositions,
    modifiers:       modifiers.filter(m => appliedModifiers.includes(m.id)),
    appliedModifiers,
    rulesFired,
    mustNotMiss,
  };
}

export function buildKBPromptBlock(kb: KBQueryResult): string {
  const sections: string[] = [
    `## CLINICAL KB — ${kb.complaintId.replace(/_/g, " ").toUpperCase()}`,
    `(${kb.rulesFired.length} rules loaded from PostgreSQL KB)`,
    "",
  ];

  if (kb.redFlags.length > 0) {
    sections.push("### RED FLAG RULES (override everything)");
    kb.redFlags.forEach(r => {
      sections.push(`- IF ${r.condition_text} → ${r.action_text} [${r.severity}]`);
    });
    sections.push("");
  }

  if (kb.mustNotMiss.length > 0) {
    sections.push("### MUST-NOT-MISS DIAGNOSES");
    kb.mustNotMiss.forEach(d => {
      sections.push(`- ${d.diagnosis_name} (${d.chief_complaint}) — always consider, never dismiss without workup`);
    });
    sections.push("");
  }

  if (kb.diagnoses.length > 0) {
    sections.push("### DIFFERENTIAL DIAGNOSIS RULES");
    kb.diagnoses.forEach(d => {
      const confidence = d.confidence_weight ? ` [confidence weight: ${d.confidence_weight}]` : "";
      const disp = d.disposition_default ? ` → default: ${d.disposition_default}` : "";
      sections.push(`- ${d.diagnosis_name}${confidence}${disp}`);
    });
    sections.push("");
  }

  if (kb.dispositions.length > 0) {
    sections.push("### DISPOSITION RULES (priority ordered)");
    kb.dispositions.forEach(d => {
      sections.push(`- [P${d.priority}] ${d.criteria} → ${d.disposition}`);
    });
    sections.push("");
  }

  if (kb.treatments.length > 0) {
    sections.push("### TREATMENT OPTIONS (pre-filtered for patient safety)");
    kb.treatments.forEach(t => {
      const dose  = t.dose  ? ` | ${t.dose}` : "";
      const route = t.route ? ` ${t.route}` : "";
      sections.push(`- ${t.medication_name}${dose}${route}`);
    });
    sections.push("");
  }

  if (kb.appliedModifiers.length > 0) {
    sections.push("### ACTIVE PATIENT MODIFIERS");
    kb.modifiers.forEach(m => {
      sections.push(`- ${m.modifier_type}: ${m.condition} → ${m.adjustment}`);
    });
    sections.push("");
  }

  sections.push(`### AUDIT TRAIL`);
  sections.push(`Rules fired: ${kb.rulesFired.join(", ")}`);

  return sections.join("\n");
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
    patient.allergies?.join("-") ?? "",
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
