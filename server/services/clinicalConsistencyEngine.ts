import type {
  CanonicalDecision,
  ClinicalFeatureMap,
  ConfidenceBand,
} from "../../shared/clinicalConsistency";
import { scoreSyndromes } from "./canonicalSyndromeRules";
import { buildCanonicalTreatmentPlan } from "./therapeuticMinimalismEngine";
import { buildCanonicalDisposition } from "./dispositionConsistencyEngine";
import { buildPhenotypeHash } from "./varianceAuditService";

function confidenceFromTopScore(score: number): ConfidenceBand {
  if (score >= 10) return "high";
  if (score >= 6)  return "moderate";
  return "low";
}

export function runClinicalConsistencyEngine(
  complaint: string,
  features: ClinicalFeatureMap
): CanonicalDecision {
  const candidates = scoreSyndromes(complaint, features);
  const winning = candidates.length > 0 && candidates[0].score > 0 ? candidates[0] : null;

  const treatment    = buildCanonicalTreatmentPlan(complaint, winning, features);
  const disposition  = buildCanonicalDisposition(complaint, winning, features);
  const phenotypeHash = buildPhenotypeHash(complaint, features);

  const varianceWarnings: string[] = [];
  const notesForClinician: string[] = [];

  if (!winning) {
    notesForClinician.push(
      "No dominant syndrome. Avoid reflex treatment. Sharpen phenotype first."
    );
  } else {
    notesForClinician.push(
      `Dominant syndrome: ${winning.label}`,
      "Canonical principle: narrowest justified treatment and consistent disposition."
    );
  }

  if (treatment.blockedAlternatives.length > 0) {
    varianceWarnings.push(
      `Shotgun protection active. Blocked alternatives: ${treatment.blockedAlternatives.join(", ")}`
    );
  }

  return {
    complaint,
    phenotypeHash,
    confidence: confidenceFromTopScore(winning?.score ?? 0),
    winningSyndrome: winning,
    alternatives: candidates.slice(1, 4),
    treatment,
    disposition,
    notesForClinician,
    varianceWarnings,
  };
}
