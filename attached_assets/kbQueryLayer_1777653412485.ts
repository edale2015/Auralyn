/**
 * kbQueryLayer.ts
 * Drop into: server/retrieval/kbQueryLayer.ts
 *
 * CONNECTS THE CLINICAL PIPELINE TO THE EXISTING KB TABLES
 *
 * THE SITUATION:
 * The Google Sheets architecture review reveals that 4,207 clinical rules
 * already exist in PostgreSQL across 6 tables:
 *   kb_complaints       — complaint registry
 *   kb_red_flag_rules   — 418 red flag rules
 *   kb_diagnosis_rules  — 2,198 diagnosis rules
 *   kb_treatment_rules  — 1,227 treatment rules
 *   kb_disposition_rules — 364 disposition rules
 *   kb_modifiers        — patient context rules
 *
 * These tables are the source of truth. The Google Sheets import them.
 * The Live Runtime reads (Group D) bypass PostgreSQL entirely — that is
 * the latency and rate-limit risk identified in the architecture review.
 *
 * THIS MODULE:
 * Queries the PostgreSQL KB tables at pipeline time (not Google Sheets directly).
 * Replaces the live Google Sheets reads for CLINICAL_QUESTIONS, CLINICAL_RULES,
 * CLINICAL_MEDICATIONS, CLINICAL_DIAGNOSES with fast DB queries.
 *
 * Also fixes the MASTER_RULE_MAP tab collision by providing a unified
 * rule query that the pipeline can use without the export conflict.
 *
 * INTEGRATION WITH EXISTING clinicalKBRetriever.ts:
 * This module extends the existing retriever by querying the real KB tables
 * rather than a subset of hand-typed rules. The existing retriever's
 * fetchRedFlagRules() and fetchDiagnosisRules() should call this module.
 *
 * EXECUTION ORDER (from the Google Sheets master rule map design):
 * 1. Pull active rules for complaint
 * 2. Apply modifier dependencies (patient context)
 * 3. Evaluate red flags FIRST (overrides everything)
 * 4. Apply scoring rules
 * 5. Aggregate cluster scores
 * 6. Apply diagnosis rules
 * 7. Apply disposition rules
 * 8. Apply medication rules + safety filters
 * 9. Generate output with audit trail
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

// ─── Types matching existing KB table schemas ─────────────────────────────────
// Column names from the architecture review document

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
  modifier_type:   string;  // age, pregnancy, comorbidity, medication, allergy
  condition:       string;
  affects:         string;  // which rules it modifies
  adjustment:      string;  // what it does
  active:          boolean;
}

export interface PatientContext {
  age?:            number;
  sex?:            "M" | "F" | "other";
  pregnant?:       boolean;
  pmh?:            string[];   // past medical history
  currentMeds?:    string[];
  allergies?:      string[];
  immunocompromised?: boolean;
  diabetic?:       boolean;
  chf?:            boolean;
  copd?:           boolean;
  renalDisease?:   boolean;
  anticoagulated?: boolean;
}

export interface KBQueryResult {
  complaintId:     string;
  redFlags:        KBRedFlagRule[];
  diagnoses:       KBDiagnosisRule[];
  treatments:      KBTreatmentRule[];
  dispositions:    KBDispositionRule[];
  modifiers:       KBModifier[];
  appliedModifiers: string[];   // which modifiers fired for this patient
  rulesFired:      string[];    // audit trail — all rule IDs used
  mustNotMiss:     KBDiagnosisRule[];  // red_flag = true diagnoses
}

// ─── Modifier evaluation ──────────────────────────────────────────────────────
// Applies patient context to filter and weight rules

function evaluateModifiers(modifiers: KBModifier[], patient: PatientContext): string[] {
  const fired: string[] = [];

  for (const mod of modifiers) {
    const c = mod.condition.toLowerCase();

    if (c.includes("age>65")    && (patient.age ?? 0) > 65)  { fired.push(mod.id); continue; }
    if (c.includes("age<18")    && (patient.age ?? 99) < 18) { fired.push(mod.id); continue; }
    if (c.includes("pregnancy") && patient.pregnant)          { fired.push(mod.id); continue; }
    if (c.includes("immunocompromised") && patient.immunocompromised) { fired.push(mod.id); continue; }
    if (c.includes("diabetes")  && patient.diabetic)          { fired.push(mod.id); continue; }
    if (c.includes("chf")       && patient.chf)               { fired.push(mod.id); continue; }
    if (c.includes("copd")      && patient.copd)              { fired.push(mod.id); continue; }
    if (c.includes("renal")     && patient.renalDisease)      { fired.push(mod.id); continue; }
    if (c.includes("anticoagul") && patient.anticoagulated)   { fired.push(mod.id); continue; }

    // Allergy checks
    if (patient.allergies?.length && c.includes("allergy")) {
      const allergyMed = mod.condition.match(/allergy[_\s](\w+)/i)?.[1]?.toLowerCase();
      if (allergyMed && patient.allergies.some(a => a.toLowerCase().includes(allergyMed))) {
        fired.push(mod.id);
      }
    }
  }

  return fired;
}

// ─── Medication safety filter ─────────────────────────────────────────────────
// Removes contraindicated medications based on patient context
// This implements the "Medications Staging" layer from the architecture

function filterSafeMedications(
  treatments:  KBTreatmentRule[],
  patient:     PatientContext,
  appliedMods: string[]
): KBTreatmentRule[] {
  return treatments.filter(tx => {
    if (!tx.contraindications) return true;
    const contra = tx.contraindications.toLowerCase();

    if (patient.pregnant   && (contra.includes("pregnancy") || contra.includes("pregnant"))) return false;
    if (patient.renalDisease && contra.includes("renal")) return false;
    if ((patient.age ?? 99) < 18 && (contra.includes("pediatric") || contra.includes("child"))) return false;

    // Check allergies against medication name
    if (patient.allergies?.length) {
      const medName = tx.medication_name.toLowerCase();
      for (const allergy of patient.allergies) {
        const a = allergy.toLowerCase();
        if (medName.includes(a)) return false;
        // Cross-reactivity: penicillin allergy → filter amoxicillin, ampicillin
        if (a.includes("penicillin") && (medName.includes("amoxicillin") || medName.includes("ampicillin"))) return false;
        // Sulfa allergy → filter TMP-SMX
        if (a.includes("sulfa") && (medName.includes("sulfamethoxazole") || medName.includes("tmp-smx"))) return false;
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

  // Normalize complaint ID (handle aliases)
  const normalizedComplaint = complaintId.toLowerCase().replace(/\s+/g, "_");

  // Parallel queries — all from PostgreSQL, no Google Sheets reads
  const [redFlagRows, diagnosisRows, treatmentRows, dispositionRows, modifierRows] = await Promise.all([

    // Red flag rules — check ALL and complaint-specific
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

    // Diagnosis rules
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

    // Treatment rules
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

    // Disposition rules
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

    // Modifiers — load all, evaluate against patient context
    db.execute(sql`
      SELECT * FROM kb_modifiers WHERE active = true
      LIMIT 100
    `).catch(() => ({ rows: [] })),

  ]);

  const redFlags    = redFlagRows.rows    as unknown as KBRedFlagRule[];
  const diagnoses   = diagnosisRows.rows  as unknown as KBDiagnosisRule[];
  const treatments  = treatmentRows.rows  as unknown as KBTreatmentRule[];
  const dispositions = dispositionRows.rows as unknown as KBDispositionRule[];
  const modifiers   = modifierRows.rows   as unknown as KBModifier[];

  // Evaluate modifiers against patient context
  const appliedModifiers = evaluateModifiers(modifiers, patient);

  // Apply medication safety filter
  const safeTreatments = filterSafeMedications(treatments, patient, appliedModifiers);

  // Identify must-not-miss diagnoses
  const mustNotMiss = diagnoses.filter(d => d.red_flag === true);

  // Build audit trail
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

// ─── Prompt block builder ─────────────────────────────────────────────────────
// Builds the system prompt injection from KB query results.
// This is what gets passed to the clinical brain.

export function buildKBPromptBlock(kb: KBQueryResult): string {
  const sections: string[] = [
    `## CLINICAL KB — ${kb.complaintId.replace(/_/g, " ").toUpperCase()}`,
    `(${kb.rulesFired.length} rules loaded from PostgreSQL KB)`,
    "",
  ];

  // Red flags — always first, highest priority
  if (kb.redFlags.length > 0) {
    sections.push("### 🚨 RED FLAG RULES (override everything)");
    kb.redFlags.forEach(r => {
      sections.push(`- IF ${r.condition_text} → ${r.action_text} [${r.severity}]`);
    });
    sections.push("");
  }

  // Must-not-miss diagnoses
  if (kb.mustNotMiss.length > 0) {
    sections.push("### ⚠ MUST-NOT-MISS DIAGNOSES");
    kb.mustNotMiss.forEach(d => {
      sections.push(`- ${d.diagnosis_name} (${d.chief_complaint}) — always consider, never dismiss without workup`);
    });
    sections.push("");
  }

  // Full differential
  if (kb.diagnoses.length > 0) {
    sections.push("### DIFFERENTIAL DIAGNOSIS RULES");
    kb.diagnoses.forEach(d => {
      const confidence = d.confidence_weight ? ` [confidence weight: ${d.confidence_weight}]` : "";
      const disp = d.disposition_default ? ` → default: ${d.disposition_default}` : "";
      sections.push(`- ${d.diagnosis_name}${confidence}${disp}`);
    });
    sections.push("");
  }

  // Disposition rules
  if (kb.dispositions.length > 0) {
    sections.push("### DISPOSITION RULES (priority ordered)");
    kb.dispositions.forEach(d => {
      sections.push(`- [P${d.priority}] ${d.criteria} → ${d.disposition}`);
    });
    sections.push("");
  }

  // Safe treatment options
  if (kb.treatments.length > 0) {
    sections.push("### TREATMENT OPTIONS (pre-filtered for patient safety)");
    kb.treatments.forEach(t => {
      const dose = t.dose ? ` | ${t.dose}` : "";
      const route = t.route ? ` ${t.route}` : "";
      sections.push(`- ${t.medication_name}${dose}${route}`);
    });
    sections.push("");
  }

  // Applied modifiers
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

// ─── Live cache layer ─────────────────────────────────────────────────────────
// Fixes Issue 3 from architecture review:
// "Group D live reads bypass PostgreSQL — latency and rate limit risk"
// This cache serves the existing live-read loaders from DB instead of Sheets

const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes — matches recommendation

interface CacheEntry {
  data:      KBQueryResult;
  cachedAt:  number;
}

const queryCache = new Map<string, CacheEntry>();

export async function queryKBCached(
  complaintId: string,
  patient:     PatientContext = {}
): Promise<KBQueryResult> {
  // Cache key includes patient risk factors that affect rule filtering
  const patientKey = [
    patient.age ? `age${patient.age}` : "",
    patient.pregnant ? "preg" : "",
    patient.immunocompromised ? "ic" : "",
    patient.diabetic ? "dm" : "",
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
