import crypto from "crypto";
import type { CanonicalDecision, ClinicalFeatureMap } from "../../shared/clinicalConsistency";

export function buildPhenotypeHash(
  complaint: string,
  features: ClinicalFeatureMap
): string {
  const normalized = Object.keys(features)
    .sort()
    .map((k) => `${k}:${String(features[k])}`)
    .join("|");

  return crypto
    .createHash("sha256")
    .update(`${complaint}|${normalized}`)
    .digest("hex")
    .slice(0, 24);
}

export interface VarianceCheckInput {
  canonical: CanonicalDecision;
  clinicianSelectedDisposition?: string;
  clinicianSelectedMedicationKey?: string;
}

export function detectVariance(input: VarianceCheckInput): string[] {
  const warnings: string[] = [];

  if (
    input.clinicianSelectedDisposition &&
    input.clinicianSelectedDisposition !== input.canonical.disposition.disposition
  ) {
    warnings.push(
      `Disposition variance: canonical=${input.canonical.disposition.disposition}, selected=${input.clinicianSelectedDisposition}`
    );
  }

  if (
    input.canonical.treatment.medicationKey &&
    input.clinicianSelectedMedicationKey &&
    input.clinicianSelectedMedicationKey !== input.canonical.treatment.medicationKey
  ) {
    warnings.push(
      `Medication variance: canonical=${input.canonical.treatment.medicationKey}, selected=${input.clinicianSelectedMedicationKey}`
    );
  }

  return warnings;
}
