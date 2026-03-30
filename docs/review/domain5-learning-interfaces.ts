/**
 * ============================================================
 * DOMAIN 5: LEARNING LOOP & DRIFT MANAGEMENT — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/learning/adaptiveEMA.ts
 *   server/learning/safeDriftCircuitBreaker.ts
 *   server/learning/demographicDriftMonitor.ts
 *   server/learning/versionedRLHF.ts      (existing — shown for context)
 *   server/learning/driftControl.ts       (existing — shown for context)
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Is the adaptive alpha formula (BASE_ALPHA × volumeFactor ÷
 *      complexityFactor) clinically sound? How does the literature
 *      approach online learning rate adjustment in medical AI?
 *   2. Is the 0.15 safety floor for the Safety Veto Agent weight
 *      the right number? What happens if the agent is genuinely
 *      performing poorly — should the floor be lower?
 *   3. The 4 drift tiers use scores 0–0.10 / 0.10–0.25 / 0.25–0.50 / ≥0.50.
 *      Are these thresholds appropriate for clinical AI drift? Or
 *      should ER_NOW false negatives alone trip Tier 3?
 *   4. What's the minimum sample size (currently 30) before we
 *      compute demographic parity? Too low = noisy, too high = delays.
 *   5. Should the demographic drift monitor track more dispositions
 *      beyond ER_NOW rate, e.g., SELF_CARE rate for over-discharge?
 * ============================================================
 */


// ─── 5.1 · Adaptive EMA with Safety Floor ────────────────────────────────────

/**
 * Rec 5.1 — Replaces fixed α=0.1 EMA with adaptive version.
 *
 * Two competing failure modes with fixed alpha:
 *   Too slow: a failing agent degrades for weeks before weight shifts
 *   Too fast: a single rare correct call inappropriately boosts weight
 *
 * Solution: alpha scales with case volume and case complexity.
 * Safety Veto Agent has a hard minimum weight floor (0.15).
 */
export enum CaseComplexityLevel {
  SIMPLE   = 1.0,   // clear chief complaint, few modifiers
  MODERATE = 1.5,   // multiple complaints or significant modifiers
  COMPLEX  = 2.5,   // multi-system, rare presentation, or pediatric
  CRITICAL = 4.0,   // life-threatening, time-sensitive
}

export interface EMAWeightResult {
  agentId:            string;
  updatedWeight:      number;
  previousWeight:     number;
  alphaUsed:          number;             // adaptive alpha used this update
  confidenceInterval: [number, number];   // 90% CI over last 20 observations
  atSafetyFloor:      boolean;
  observations:       number;             // total cumulative observations
}

/**
 * Key constants:
 *   SAFETY_FLOOR_WEIGHT = 0.15  (Safety Veto Agent minimum)
 *   BASE_ALPHA          = 0.1
 *   MAX_ALPHA_MULTIPLIER = 2.0  (alpha caps at 0.2)
 *   MAX_HISTORY         = 20   (last 20 observations for CI calculation)
 *
 * Alpha formula: BASE_ALPHA × min(caseVolume/100, 2.0) × (1/complexity)
 */
export declare function computeAdaptiveEMA(
  agentId:        string,
  currentWeight:  number,
  recentAccuracy: number,    // 0–1
  caseVolume:     number,    // recent case count driving the update
  complexity?:    CaseComplexityLevel
): EMAWeightResult;

export declare function getAgentWeightHistory(agentId: string): number[];
export declare function resetAgentObservations(agentId: string): void;


// ─── 5.2 · 4-Tier Drift Circuit Breaker ──────────────────────────────────────

/**
 * Rec 5.2 — Replaces the 2-state (locked/unlocked) drift model with
 * 4 tiers of human involvement before emergency rollback.
 *
 * Under FDA's PCCP framework, every tier above Tier 1 must create a
 * human-reviewable audit record.
 *
 * Agent addition: Demographic parity delta contributes to the drift score.
 * If any demographic group's ER_NOW rate deviates >5% from global mean,
 * the score is increased — ensuring bias detection triggers drift response.
 */
export type DriftTier =
  | "MONITOR"            // Tier 1: score < 0.10 — log only
  | "ALERT"              // Tier 2: 0.10–0.25 — alert medical director
  | "CIRCUIT_OPEN"       // Tier 3: 0.25–0.50 — freeze policy, human review ticket
  | "EMERGENCY_ROLLBACK" // Tier 4: ≥ 0.50 — rollback + page on-call physician

export interface DriftMetrics {
  performanceDelta:        number;    // change in overall accuracy (0–1)
  erNowFalseNegRate?:      number;    // false negative rate for ER_NOW — most critical
  demographicParityDelta?: number;    // max disparity across demographic groups (0–1)
  caseVolume24h?:          number;
  recentErrorRate?:        number;
}

export interface DriftDecision {
  tier:                DriftTier;
  score:               number;        // computed drift score (0–1)
  action:              string;        // human-readable action taken
  requiresHumanReview: boolean;
  reviewDeadlineHours?: number;       // Tier 3: 24h, Tier 4: 4h
  reviewTicketId?:     string;        // created for Tier 2–4
  rollbackTriggered:   boolean;
}

/** Drift score formula:
 *    score = max(|performanceDelta|, erNowFalseNegRate × 2.0)
 *    + demographicParityDelta × 0.5 (if > 0.05)
 *    capped at 1.0
 *
 *  ER_NOW false negatives are weighted 2× because false negative = death.
 */
export declare function evaluateDrift(metrics: DriftMetrics): Promise<DriftDecision>;

export declare function getSafeDriftState(): {
  circuitState:   "CLOSED" | "OPEN";
  lastDriftScore: number;
  openedAt:       string | null;
};

/** Manually reset circuit to CLOSED after human review. */
export declare function resetSafeDriftCircuit(): void;


// ─── 5.3 · Demographic Drift Monitor (agent addition) ────────────────────────

/**
 * Detects systematic undertriage bias across demographic groups.
 *
 * Legal basis: ACA §1557 — OCR has explicitly stated that algorithmic
 * bias resulting in disparate health outcomes is actionable under federal
 * civil rights law. HIPAA + state mandatory reporting also apply when
 * a demographic safety failure results in harm to a minor.
 *
 * Design: No PHI stored — only aggregate disposition counts per
 * anonymous group label. Minimum 30 cases per group before analysis.
 */
export type DemographicGroup =
  | "age_under_18"
  | "age_18_to_40"
  | "age_41_to_65"
  | "age_over_65"
  | "female"
  | "male"
  | "other_gender"
  | "pregnant"
  | "pediatric";

export interface DispositionCount {
  ER_NOW:      number;
  ER_URGENT:   number;
  URGENT_CARE: number;
  ROUTINE:     number;
  SELF_CARE:   number;
  total:       number;
}

export interface ParityAnalysis {
  globalErNowRate:    number;
  groupParityResults: Array<{
    group:            DemographicGroup | string;
    erNowRate:        number;
    deltaFromGlobal:  number;
    flagged:          boolean;    // delta > PARITY_THRESHOLD (0.05)
    sampleSize:       number;
  }>;
  maxDelta:           number;     // largest delta across all groups
  flaggedGroups:      string[];
  analysisAt:         string;
}

/**
 * Records a disposition for a set of demographic groups.
 * Increments both per-group and global counters.
 * PHI-safe: only group labels (e.g. "age_over_65"), never patient ID.
 */
export declare function recordDispositionForGroup(
  groups:      DemographicGroup[],
  disposition: string
): void;

/**
 * Computes ER_NOW rate per group vs global rate.
 * Groups with < 30 cases are excluded (too small to analyze).
 * Automatically records DEMOGRAPHIC_PARITY_DELTA SLO value.
 * Fires ALERT event if any group exceeds 5% delta.
 */
export declare function computeParityAnalysis(): ParityAnalysis;

export declare function getGroupDispositionCounts(): Record<string, DispositionCount>;
export declare function getGlobalDispositionCounts(): DispositionCount;


// ─── 5.4 · Existing Versioned RLHF (shown for context) ──────────────────────

/**
 * The existing RLHF system — shown here for domain context.
 * All weight updates are human-gated (see Domain 2 Policy Gate).
 */
export interface WeightUpdateProposal {
  proposalId:  string;
  diagnosisKey: string;
  delta:        number;
  rationale:    string;
  proposedBy:   string;
  proposedAt:   string;
  outcome?:     string;
}

export interface ModelVersion {
  versionId:    string;
  appliedAt:    string;
  approvedBy:   string;
  updatesCount: number;
  proposalIds:  string[];
  notes?:       string;
}

export declare function proposeWeightUpdate(proposal: {
  diagnosisKey: string;
  delta:        number;
  rationale:    string;
  proposedBy:   string;
}): WeightUpdateProposal;

export declare function approveProposals(approvedBy: string, notes?: string): ModelVersion | null;
export declare function getPendingProposals(): WeightUpdateProposal[];
export declare function getModelVersions(): ModelVersion[];
export declare function getVersionedRLHFStats(): {
  pendingCount:   number;
  totalApproved:  number;
  proposalCount:  number;
  lastAppliedAt?: string;
};


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  GET  /api/compliance/drift-circuit
  POST /api/compliance/drift-circuit/evaluate
  POST /api/compliance/drift-circuit/reset
  GET  /api/compliance/demographic-parity
  POST /api/compliance/demographic-parity/record
*/
