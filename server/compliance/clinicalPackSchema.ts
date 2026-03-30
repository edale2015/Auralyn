/**
 * DOMAIN 7 — REC 7.2: Standardized ClinicalPack Schema
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - Raise golden case minimum from 20 → 50 (FDA expects 50 minimum for 510(k))
 *   - RegisteredScoringInstrument enum — replaces free-form strings (validation safety)
 *   - getRequiredReviewCadenceMonths() — semi-annual for ER_NOW-heavy packs
 *   - PACK_VALIDATION_THRESHOLDS constants
 */

export type SaMDClass = "Class_I" | "Class_II" | "Class_II_510k" | "Class_III_PMA";

export interface SemanticVersion { major: number; minor: number; patch: number; }

/**
 * Claude rec: registered scoring instrument enum.
 * Replacing free-form strings prevents misspelled instrument names passing validation.
 * Adding a new instrument requires a physician-approved pull request.
 */
export enum RegisteredScoringInstrument {
  CENTOR_SCORE   = "Centor Score",
  MCISAAC_SCORE  = "McIsaac Score",
  HEART_LITE     = "HEART-lite Score",
  PHQ2           = "PHQ-2",
  PHQ9           = "PHQ-9",
  NEWS2          = "NEWS2",
  PEWS           = "PEWS",
  CURB65         = "CURB-65",
  QSOFA          = "qSOFA",
  SHOCK_INDEX    = "Shock Index",
  PECARN         = "PECARN",
  WELLS_PE       = "Wells Score (PE)",
  WELLS_DVT      = "Wells Score (DVT)",
  OTTAWA_ANKLE   = "Ottawa Ankle Rules",
  OTTAWA_KNEE    = "Ottawa Knee Rules",
  PHOENIX_SCORE  = "Phoenix Pediatric Sepsis Score",
}

/**
 * Claude rec: validation thresholds.
 * Raised from 20 → 50 (FDA 510(k) guidance, AI/ML Action Plan 2021).
 */
export const PACK_VALIDATION_THRESHOLDS = {
  minimumGoldenCases:           50,    // raised from 20
  minimumCriticalGoldenCases:    5,    // raised from 3
  minimumGoldenCasesFor510k:   100,    // for packs included in 510(k) submission
  minimumGoldenCasesAmendment: 200,    // for packs requiring 510(k) amendment
};

export interface DecisionNode {
  nodeId:             string;
  question:           string;
  symptomKey?:        string;
  yesNextNodeId?:     string;
  noNextNodeId?:      string;
  leafDisposition?:   string;
}

export interface ScoringInstrument {
  name:        RegisteredScoringInstrument;   // Claude rec: enum not string
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
  group:       string;
  modifier:    string;
  description: string;
}

export interface GoldenCase {
  caseId:               string;
  description:          string;
  inputSymptoms:        string[];
  inputRawText:         string;
  expectedDisposition:  string;
  minimumConfidence:    number;
  clinicalRationale:    string;
  isCritical:           boolean;
}

export interface ClinicalPack {
  packId:              string;
  packVersion:         SemanticVersion;
  displayName:         string;
  complaintCategories: string[];

  decisionTree:        DecisionNode[];
  scoringInstruments:  ScoringInstrument[];
  hardStops:           HardStopSpecification[];
  demographicModifiers: DemographicModifier[];

  clinicalEvidenceBase:    string[];
  lastClinicalReviewDate:  string;
  reviewingPhysicianId:    string;
  fdaClassification:       SaMDClass;
  submissionScope:         string;

  goldenCases:        GoldenCase[];
  minimumSensitivity: number;
  minimumSpecificity: number;
}

export interface PackValidationResult {
  packId:   string;
  valid:    boolean;
  warnings: string[];
  errors:   string[];
}

/**
 * Claude rec: semi-annual review for ER_NOW-heavy packs.
 * A pack is "ER_NOW-heavy" if >20% of golden cases have expectedDisposition = ER_NOW.
 */
export function getRequiredReviewCadenceMonths(pack: ClinicalPack): number {
  if (pack.fdaClassification === "Class_III_PMA") return 6;
  const erNowCases = pack.goldenCases.filter(c => c.expectedDisposition === "ER_NOW").length;
  const erNowPct   = pack.goldenCases.length > 0 ? erNowCases / pack.goldenCases.length : 0;
  if (erNowPct > 0.20) return 6;   // semi-annual
  return 12;                        // annual
}

export function validateClinicalPack(pack: ClinicalPack): PackValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!pack.packId)               errors.push("packId is required");
  if (!pack.displayName)          errors.push("displayName is required");
  if (!pack.reviewingPhysicianId) errors.push("reviewingPhysicianId is required");
  if (!pack.lastClinicalReviewDate) errors.push("lastClinicalReviewDate is required for FDA compliance");

  // Claude rec: raised from 20 → 50
  if (pack.goldenCases.length < PACK_VALIDATION_THRESHOLDS.minimumGoldenCases) {
    errors.push(`Insufficient golden cases: ${pack.goldenCases.length}/${PACK_VALIDATION_THRESHOLDS.minimumGoldenCases} minimum (FDA 510(k) requirement)`);
  }
  const criticalGolden = pack.goldenCases.filter(g => g.isCritical);
  if (criticalGolden.length < PACK_VALIDATION_THRESHOLDS.minimumCriticalGoldenCases) {
    warnings.push(`Only ${criticalGolden.length} critical golden cases — recommend ≥ ${PACK_VALIDATION_THRESHOLDS.minimumCriticalGoldenCases} for CI gate`);
  }

  if (pack.clinicalEvidenceBase.length === 0) {
    errors.push("At least one clinical evidence citation is required for FDA audit trail");
  }
  if (pack.minimumSensitivity < 0.90) {
    errors.push(`minimumSensitivity ${pack.minimumSensitivity} < 0.90 — ER_NOW SLO requires 0.99`);
  }
  if (pack.hardStops.length === 0 && pack.complaintCategories.some(c =>
    ["chest", "stroke", "mental health", "pediatric", "allergic"].some(h => c.toLowerCase().includes(h))
  )) {
    warnings.push("High-risk complaint category with no pack-specific hard stops — verify global hard-stop coverage");
  }

  // Claude rec: semi-annual review check for ER_NOW-heavy packs
  const requiredCadenceMonths = getRequiredReviewCadenceMonths(pack);
  const reviewAge  = new Date().getTime() - new Date(pack.lastClinicalReviewDate).getTime();
  const reviewAgeMonths = reviewAge / (1000 * 60 * 60 * 24 * 30);
  if (reviewAgeMonths > requiredCadenceMonths) {
    warnings.push(`Clinical review is ${Math.round(reviewAgeMonths)} months old — ${requiredCadenceMonths === 6 ? "semi-annual" : "annual"} review required for this pack type`);
  }

  // 510(k) readiness check
  if (pack.goldenCases.length < PACK_VALIDATION_THRESHOLDS.minimumGoldenCasesFor510k) {
    warnings.push(`Only ${pack.goldenCases.length} golden cases — ${PACK_VALIDATION_THRESHOLDS.minimumGoldenCasesFor510k} needed for 510(k) submission`);
  }

  return { packId: pack.packId, valid: errors.length === 0, warnings, errors };
}

const packRegistry = new Map<string, ClinicalPack>();

export function registerPack(pack: ClinicalPack): PackValidationResult {
  const result = validateClinicalPack(pack);
  if (result.valid) packRegistry.set(pack.packId, pack);
  if (result.warnings.length > 0) console.warn(`[PackRegistry] ${pack.packId} warnings:`, result.warnings);
  if (!result.valid)               console.error(`[PackRegistry] ${pack.packId} FAILED:`, result.errors);
  return result;
}

export function getPack(packId: string): ClinicalPack | undefined {
  return packRegistry.get(packId);
}

export function getAllPackSummaries(): Array<{
  packId: string; displayName: string; valid: boolean;
  goldenCaseCount: number; reviewCadenceMonths: number;
}> {
  return Array.from(packRegistry.values()).map(p => ({
    packId:              p.packId,
    displayName:         p.displayName,
    valid:               validateClinicalPack(p).valid,
    goldenCaseCount:     p.goldenCases.length,
    reviewCadenceMonths: getRequiredReviewCadenceMonths(p),
  }));
}
