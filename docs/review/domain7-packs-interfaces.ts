/**
 * ============================================================
 * DOMAIN 7: MISSING FEATURES & CLINICAL PACKS — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/compliance/clinicalPackSchema.ts
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Is the 20-golden-case minimum sufficient for a 510(k) submission?
 *      What does the FDA's 2021 AI/ML Action Plan suggest for test set size?
 *   2. The ClinicalPack schema requires FDA classification per-pack.
 *      For stroke/neurological and mental health packs — which 510(k)
 *      predicates would be cited for clearance?
 *   3. Is annual clinical review (12 months) the right cadence, or
 *      should high-risk packs (ER_NOW-heavy) require semi-annual review?
 *   4. The scoring instruments field is free-form strings. Should there
 *      be a registry of approved instruments with validated thresholds?
 *   5. For the 7 packs identified as missing (stroke, mental health,
 *      anaphylaxis, urological, dermatological, musculoskeletal, pediatric
 *      fever) — what's the implementation priority order considering
 *      both clinical risk and FDA clearance complexity?
 *
 * MISSING PACKS TABLE (from Claude 7-Domain Review):
 *   Pack                        Risk       FDA Impact if Added
 *   ─────────────────────────── ─────────  ────────────────────────────
 *   Stroke / Neurological       CRITICAL   Requires 510(k) amendment
 *   Mental Health / Suicidality CRITICAL   Requires 510(k) amendment
 *   Allergic Reaction / Anaphylaxis CRITICAL Existing 510(k) scope
 *   Urological (non-testicular) HIGH       Existing scope
 *   Dermatological              MEDIUM     Existing scope
 *   Musculoskeletal / Fracture  MEDIUM     Existing scope
 *   Pediatric Fever Stratified  CRITICAL   Requires pediatric 510(k)
 * ============================================================
 */


// ─── 7.1 · FDA Classification Types ──────────────────────────────────────────

export type SaMDClass =
  | "Class_I"          // Low risk — general wellness
  | "Class_II_510k"    // Moderate risk — requires 510(k) clearance
  | "Class_III_PMA";   // High risk — requires Premarket Approval

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}


// ─── 7.2 · Standardized ClinicalPack Schema ──────────────────────────────────

/**
 * Rec 7.2 — Universal pack interface that makes every future pack
 * consistent and auditable. All fields are required unless marked optional.
 * A pack must pass validateClinicalPack() before registerPack() accepts it.
 */
export interface DecisionNode {
  nodeId:           string;
  question:         string;
  symptomKey?:      string;
  yesNextNodeId?:   string;
  noNextNodeId?:    string;
  leafDisposition?: string;   // only set on leaf nodes
}

export interface ScoringInstrument {
  name:        string;    // e.g. "Centor Score", "HEART-lite", "PHQ-2", "NEWS"
  description: string;
  fields:      string[];  // the questions/inputs the instrument uses
  citations:   string[];  // PubMed/DOI citations for the instrument
}

export interface HardStopSpecification {
  symptomKey:  string;
  disposition: string;
  rationale:   string;
  fdaCode:     string;
}

export interface DemographicModifier {
  group:       string;    // e.g. "pediatric", "pregnant", "elderly"
  modifier:    string;    // e.g. "lower_fever_threshold"
  description: string;
}

export interface GoldenCase {
  caseId:              string;
  description:         string;
  inputSymptoms:       string[];
  inputRawText:        string;
  expectedDisposition: string;
  minimumConfidence:   number;   // 0–1
  clinicalRationale:  string;
  isCritical:          boolean;  // if true, failure on this case blocks CI merge
}

export interface ClinicalPack {
  packId:              string;
  packVersion:         SemanticVersion;
  displayName:         string;
  complaintCategories: string[];

  // Clinical decision content
  decisionTree:        DecisionNode[];
  scoringInstruments:  ScoringInstrument[];
  hardStops:           HardStopSpecification[];
  demographicModifiers: DemographicModifier[];

  // FDA audit metadata — required for 510(k) documentation
  clinicalEvidenceBase:   string[];   // PubMed/DOI citations for decision logic
  lastClinicalReviewDate: string;     // ISO date — annual review required
  reviewingPhysicianId:   string;     // physician who signed off this version
  fdaClassification:      SaMDClass;
  submissionScope:        string;     // which 510(k) or PMA this falls under

  // Testing requirements (Rec 7.3)
  goldenCases:        GoldenCase[];   // MINIMUM 20 required
  minimumSensitivity: number;         // for ER_NOW dispositions in this pack
  minimumSpecificity: number;
}


// ─── 7.3 · Pack Validation ────────────────────────────────────────────────────

export interface PackValidationResult {
  packId:   string;
  valid:    boolean;
  warnings: string[];
  errors:   string[];
}

/**
 * Validates a ClinicalPack against all schema requirements.
 *
 * Errors (fail validation):
 *   - Missing packId, displayName, reviewingPhysicianId, lastClinicalReviewDate
 *   - Fewer than 20 golden cases
 *   - minimumSensitivity < 0.90
 *   - Zero clinical evidence citations
 *   - High-risk complaint category with no pack-specific hard stops
 *
 * Warnings (pass but flag):
 *   - Fewer than 3 critical golden cases
 *   - Clinical review older than 12 months
 */
export declare function validateClinicalPack(pack: ClinicalPack): PackValidationResult;

/**
 * Registers a pack after validation. Packs with errors are NOT registered.
 * Warnings are logged but registration proceeds.
 * All registered packs are queryable via getAllPackSummaries().
 */
export declare function registerPack(pack: ClinicalPack): PackValidationResult;

export declare function getPack(packId: string): ClinicalPack | undefined;

export declare function getAllPackSummaries(): Array<{
  packId:          string;
  displayName:     string;
  valid:           boolean;
  goldenCaseCount: number;
}>;


// ─── 7.4 · CI/CD Golden Case Runner (Rec 7.3) ────────────────────────────────

/**
 * Rec 7.3 — Golden case CI/CD strategy.
 * Currently configured as constants — not yet wired into CI pipeline.
 */
export interface GoldenCaseRunnerConfig {
  // Run on every PR — block merge if sensitivity drops
  prGate: {
    minimumERNowSensitivity:  0.99;
    minimumOverallAccuracy:   0.90;
    blockOnFailure:           true;
  };

  // Run nightly against production traffic sample
  nightlyRun: {
    sampleSize:       500;
    includeRecentCases: true;
    alertThreshold:   0.02;   // alert if accuracy drops 2% from baseline
  };

  // Run before any policy promotion
  policyGate: {
    requiredBeforePromotion: true;
    minimumCasesRun:         1000;
    requiresPhysicianSignOff: true;
  };
}

/** Existing golden case runner — single file argument. */
export declare function runGoldenCases(
  fileName?: string   // default: "goldenCases.sample.json"
): Promise<GoldenCaseRunResults>;

export interface GoldenCaseRunResults {
  totalCases:       number;
  passed:           number;
  failed:           number;
  erNowSensitivity: number;
  overallAccuracy:  number;
  failures:         Array<{ caseId: string; expected: string; actual: string; confidence: number }>;
  ranAt:            string;
}


// ─── 7.5 · FDA Regulatory Posture Summary ────────────────────────────────────
/*
  CURRENT STATUS: Operating in regulatory gray zone.

  CLASS II CONSISTENT features:
    ✓ Physician reviews all dispositions (with checkpoint gate now implemented)
    ✓ Hard-stop rules bypass autonomous debate for life-threatening conditions
    ✓ Human-gated policy promotion (Rec 2.3)

  CLASS III RISK features (still present):
    ⚠ Safety Veto Agent has hard veto power — currently gated by physician
      checkpoint for ER_NOW/ER_URGENT but veto itself is autonomous
    ⚠ RLHF weight updates — autonomous EMA updates, only policy mode requires
      physician approval
    ⚠ Multi-agent consensus without mandatory physician confirmation for
      TELEHEALTH_NOW, NEXT_DAY, ROUTINE, SELF_CARE dispositions

  TO MAINTAIN CLASS II / FILE 510(k):
    1. ✅ Physician pre-approval for ER_NOW + ER_URGENT (IMPLEMENTED)
    2. ✅ Human-gated policy promotion (IMPLEMENTED)
    3. □  File 510(k) for ENT and Flu packs as initial submission scope
    4. □  Submit PCCP before enabling any autonomous learning updates

  FEATURES REQUIRING NEW 510(k) OR AMENDMENT:
    - Adding stroke/neurological pack
    - Adding mental health/suicidality pack
    - Adding pediatric-specific triage with age-stratified hard stops
      (hard stops implemented — but 510(k) amendment still needed)
    - Enabling autonomous disposition delivery without physician review
*/


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  GET  /api/compliance/packs
  POST /api/compliance/packs/validate
*/
