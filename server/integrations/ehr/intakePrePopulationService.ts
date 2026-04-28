/**
 * intakePrePopulationService.ts
 *
 * Called during intake when a patient's EHR identity is known.
 * Fetches their clinical context and merges it into answers.structured
 * so the AI triage engine starts with verified data rather than self-report.
 *
 * Safe merge rules:
 *   - Patient self-report WINS over EHR for symptom questions
 *   - EHR WINS for medications, allergies, conditions (patients frequently omit)
 *   - Demographics filled from EHR only if not already present
 *   - All EHR-sourced fields tagged with _source: "ehr" for audit visibility
 */

import { fetchPatientContext, EhrVendor, PatientContext } from "./fhirPatientContext";

export interface PrePopulationResult {
  success:          boolean;
  patientContext?:  PatientContext;
  patch:            Record<string, any>;
  fieldsAdded:      string[];
  errors:           string[];
}

export async function prePopulateIntake({
  patientId,
  vendor,
  accessToken,
  existingAnswers = {},
}: {
  patientId:        string;
  vendor:           EhrVendor;
  accessToken?:     string;
  existingAnswers?: Record<string, any>;
}): Promise<PrePopulationResult> {

  const errors:      string[] = [];
  const fieldsAdded: string[] = [];
  const patch:       Record<string, any> = {};

  let ctx: PatientContext;

  try {
    ctx = await fetchPatientContext({ vendor, patientId, accessToken });
  } catch (err: any) {
    return {
      success:     false,
      patch:       {},
      fieldsAdded: [],
      errors:      [`Context fetch failed: ${err.message}`],
    };
  }

  if (ctx.errors.length > 0) {
    errors.push(...ctx.errors);
  }

  const ip = ctx.intakePatch;

  // ── Demographics — fill only if not already present ──────────────────────
  const demographicFields: Array<[string, any]> = [
    ["name", ip.name],
    ["dob",  ip.dob],
    ["age",  ip.age],
    ["sex",  ip.sex],
  ];

  for (const [key, value] of demographicFields) {
    if (value !== undefined && !existingAnswers[key]) {
      patch[key]             = value;
      patch[`${key}_source`] = "ehr";
      fieldsAdded.push(key);
    }
  }

  // ── Medications — EHR wins, merge with any patient-reported meds ─────────
  if (ip.medications.length > 0) {
    const existing  = Array.isArray(existingAnswers.medications) ? existingAnswers.medications : [];
    const ehrNames  = new Set(ip.medications.map(m => m.split(" ")[0].toLowerCase()));
    const filtered  = existing.filter((m: string) => !ehrNames.has(m.split(" ")[0].toLowerCase()));
    patch.medications        = [...ip.medications, ...filtered];
    patch.medications_source = "ehr_merged";
    fieldsAdded.push("medications");
  }

  // ── Allergies — EHR wins ─────────────────────────────────────────────────
  if (ip.allergies.length > 0) {
    patch.allergies        = ip.allergies;
    patch.allergies_source = "ehr";
    fieldsAdded.push("allergies");
  }

  // ── Conditions — EHR wins ────────────────────────────────────────────────
  if (ip.conditions.length > 0) {
    patch.conditions        = ip.conditions;
    patch.conditions_source = "ehr";
    fieldsAdded.push("conditions");
  }

  // ── Metadata ─────────────────────────────────────────────────────────────
  patch._ehr_prepopulated = true;
  patch._ehr_vendor       = vendor;
  patch._ehr_patient_id   = patientId;
  patch._ehr_fetched_at   = ctx.fetchedAt;

  return {
    success:       true,
    patientContext: ctx,
    patch,
    fieldsAdded,
    errors,
  };
}
