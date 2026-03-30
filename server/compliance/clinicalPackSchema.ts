/**
 * DOMAIN 7 — REC 7.2: Standardized ClinicalPack Schema
 *
 * Universal pack interface that makes every future clinical pack
 * consistent and auditable. Required fields include:
 *   - FDA audit metadata (clinical evidence citations, last review date)
 *   - Scoring instruments used (Centor, HEART-lite, PHQ-2, etc.)
 *   - Pack-specific hard stops
 *   - Golden case requirements (minimum 20 per pack, per Rec 7.3)
 *
 * MY ADDITION: Pack validator that runs at startup and reports
 * any registered packs that fail schema requirements.
 */

export type SaMDClass = "Class_I" | "Class_II" | "Class_II_510k" | "Class_III_PMA";

export interface SemanticVersion { major: number; minor: number; patch: number; }

export interface DecisionNode {
  nodeId:       string;
  question:     string;
  symptomKey?:  string;
  yesNextNodeId?: string;
  noNextNodeId?:  string;
  leafDisposition?: string;
}

export interface ScoringInstrument {
  name:        string;  // e.g., "Centor Score", "HEART-lite", "PHQ-2", "NEWS"
  description: string;
  fields:      string[];
  citations:   string[];
}

export interface HardStopSpecification {
  symptomKey:  string;
  disposition: string;
  rationale:   string;
  fdaCode:     string;
}

export interface DemographicModifier {
  group:          string;       // e.g., "pediatric", "pregnant", "elderly"
  modifier:       string;       // e.g., "lower_fever_threshold"
  description:    string;
}

export interface GoldenCase {
  caseId:               string;
  description:          string;
  inputSymptoms:        string[];
  inputRawText:         string;
  expectedDisposition:  string;
  minimumConfidence:    number;
  clinicalRationale:    string;
  isCritical:           boolean;  // if true, failure blocks CI
}

export interface ClinicalPack {
  packId:             string;
  packVersion:        SemanticVersion;
  displayName:        string;
  complaintCategories: string[];

  decisionTree:       DecisionNode[];
  scoringInstruments: ScoringInstrument[];
  hardStops:          HardStopSpecification[];
  demographicModifiers: DemographicModifier[];

  // FDA audit metadata — required for 510(k) documentation
  clinicalEvidenceBase:    string[];    // PubMed/DOI citations
  lastClinicalReviewDate:  string;      // ISO date string
  reviewingPhysicianId:    string;
  fdaClassification:       SaMDClass;
  submissionScope:         string;      // what 510(k) or PMA does this fall under

  // Testing requirements
  goldenCases:       GoldenCase[];      // minimum 20 required
  minimumSensitivity: number;           // for ER_NOW dispositions
  minimumSpecificity: number;
}

export interface PackValidationResult {
  packId:   string;
  valid:    boolean;
  warnings: string[];
  errors:   string[];
}

export function validateClinicalPack(pack: ClinicalPack): PackValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!pack.packId)       errors.push("packId is required");
  if (!pack.displayName)  errors.push("displayName is required");
  if (!pack.reviewingPhysicianId) errors.push("reviewingPhysicianId is required — pack must have physician sign-off");
  if (!pack.lastClinicalReviewDate) errors.push("lastClinicalReviewDate is required for FDA compliance");

  if (pack.goldenCases.length < 20) {
    errors.push(`Insufficient golden cases: ${pack.goldenCases.length}/20 minimum required (Rec 7.3)`);
  }
  const criticalGolden = pack.goldenCases.filter(g => g.isCritical);
  if (criticalGolden.length < 3) {
    warnings.push(`Only ${criticalGolden.length} critical golden cases — recommend ≥ 3 for CI gate`);
  }

  if (pack.clinicalEvidenceBase.length === 0) {
    errors.push("At least one clinical evidence citation is required for FDA audit trail");
  }

  if (pack.minimumSensitivity < 0.90) {
    errors.push(`minimumSensitivity ${pack.minimumSensitivity} is below 0.90 — ER_NOW SLO requires 0.99 sensitivity`);
  }

  if (pack.hardStops.length === 0 && pack.complaintCategories.some(c =>
    ["chest", "stroke", "mental health", "pediatric", "allergic"].some(h => c.toLowerCase().includes(h))
  )) {
    warnings.push("High-risk complaint category with no pack-specific hard stops — review against global hard-stop rules");
  }

  const reviewAge = new Date().getTime() - new Date(pack.lastClinicalReviewDate).getTime();
  const reviewAgeMonths = reviewAge / (1000 * 60 * 60 * 24 * 30);
  if (reviewAgeMonths > 12) {
    warnings.push(`Clinical review is ${Math.round(reviewAgeMonths)} months old — annual review recommended`);
  }

  return {
    packId: pack.packId,
    valid:  errors.length === 0,
    warnings,
    errors,
  };
}

// MY ADDITION: Pack registry — all packs register here at startup
const packRegistry = new Map<string, ClinicalPack>();

export function registerPack(pack: ClinicalPack): PackValidationResult {
  const result = validateClinicalPack(pack);
  if (result.valid) {
    packRegistry.set(pack.packId, pack);
  }
  if (result.warnings.length > 0) {
    console.warn(`[PackRegistry] ${pack.packId} registered with warnings:`, result.warnings);
  }
  if (!result.valid) {
    console.error(`[PackRegistry] ${pack.packId} FAILED validation:`, result.errors);
  }
  return result;
}

export function getPack(packId: string): ClinicalPack | undefined {
  return packRegistry.get(packId);
}

export function getAllPackSummaries(): Array<{ packId: string; displayName: string; valid: boolean; goldenCaseCount: number }> {
  return Array.from(packRegistry.values()).map(p => ({
    packId:         p.packId,
    displayName:    p.displayName,
    valid:          validateClinicalPack(p).valid,
    goldenCaseCount: p.goldenCases.length,
  }));
}
