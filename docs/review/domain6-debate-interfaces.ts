/**
 * ============================================================
 * DOMAIN 6: MULTI-AGENT DEBATE ARCHITECTURE — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/phase9/debate/debateEngine.ts         (existing)
 *   server/phase9/debate/redTeamAgent.ts         (new — Rec 1.3)
 *   server/phase9/debate/consensusFailureHandler.ts (new — Rec 6.1 + 6.2)
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. The Red Team Agent scans for 8 frequently-missed symptom patterns.
 *      Are there high-value patterns missing (e.g., back pain + AAA, 
 *      productive cough + hemoptysis, orthostatic hypotension)?
 *   2. Is the confidence floor of 0.72 (universal) and 0.85 (ER_NOW)
 *      consistent with what Epic's CDSS uses? Too conservative?
 *   3. The Red Team Agent forces physician review when 1+ high-severity
 *      missed symptoms are found. Should the bar be lower (any missed
 *      symptom) or higher (2+ missed symptoms)?
 *   4. The current debate has 3 agents + 1 adversarial (Red Team).
 *      Should the Red Team vote be included in the Bayesian average?
 *      Or should it always remain non-voting?
 *   5. What's the right timeout for a single debate round? Currently
 *      there is no per-debate timeout. Should there be?
 * ============================================================
 */


// ─── 6.1 · Existing 3-Agent Debate Engine (context) ──────────────────────────

/**
 * The existing 3-agent debate — shown for context.
 * Agents run in parallel. Consensus uses Bayesian model averaging
 * weighted by each agent's historical accuracy (from Redis EMA).
 *
 * Agent roles:
 *   1. HybridReasoning    — deterministic fusion + Bayesian differential
 *   2. BayesianDifferential — pure probabilistic from symptom priors
 *   3. SafetyVeto          — conservative bias; veto power on ER cases
 */
export interface AgentOpinion {
  agent:              string;
  role:               "primary_reasoning" | "bayesian_differential" | "safety_veto";
  diagnosis:          string;
  confidence:         number;     // 0–1
  disposition:        string;     // one of the 7 DispositionTier values
  reasoning:          string;
  differential:       Array<{ dx: string; score: number }>;
  historicalAccuracy: number;     // EMA accuracy from Redis
}

export interface DebateResult {
  opinions:                AgentOpinion[];
  consensus:               AgentOpinion;
  disagreement:            boolean;
  disagreementType:        "diagnosis" | "disposition" | "none";
  safetyVetoed:            boolean;
  confidenceDelta:         number;   // difference between highest and lowest agent confidence
  modelAveragedDiagnosis:  string;
  modelAveragedConfidence: number;
  debateMs:                number;
  debatedAt:               string;
}

export declare function runDebate(input: {
  complaint:    string;
  symptoms:     string[];
  rawText:      string;
  patientAge?:  number;
  metadata?:    Record<string, unknown>;
}): Promise<DebateResult>;


// ─── 6.2 · Red Team Agent (Rec 1.3 — 4th Adversarial Agent) ─────────────────

/**
 * The 4th agent — non-voting, adversarial.
 * Its sole purpose is to challenge consensus and search for evidence
 * the other three agents missed. Always argues for higher acuity.
 *
 * The 8 frequently-missed symptom patterns it checks:
 *   diaphoresis       — sweating, drenched, soaking (high severity)
 *   radiation_pattern — jaw pain, left arm, teeth hurt (high severity)
 *   palpitations      — heart racing, skipping beats (medium)
 *   melena            — blood in stool, dark stool, tarry (high severity)
 *   thunderclap_headache — worst headache, sudden (high severity)
 *   ataxia            — can't walk straight, off balance (high severity)
 *   diplopia          — double vision, blurry (medium)
 *   paresthesia       — numbness, tingling (medium)
 */
export interface RedTeamInput {
  consensusDisposition:  string;   // what the 3 agents agreed on
  consensusConfidence:   number;   // 0–1 confidence of consensus
  agentOpinions:         Array<{
    agent:       string;
    disposition: string;
    confidence:  number;
    reasoning:   string;
  }>;
  rawPatientText:        string;
  extractedSymptoms:     string[];
  complaint:             string;
}

export interface RedTeamVerdict {
  challenged:               boolean;
  challengeDisposition?:    DispositionTier;   // escalated one tier from consensus
  counterEvidence:          string[];          // high-severity missed symptoms found
  missedSymptoms:           string[];          // all missed symptoms (any severity)
  alternativeDifferentials: string[];          // alternative diagnoses to consider
  requiresPhysicianReview:  boolean;
  challengeConfidence:      number;            // 0–1 (confidence in the challenge)
  challengeReason:          string;            // human-readable summary
}

/**
 * Trigger conditions for requiresPhysicianReview = true:
 *   - consensusConfidence < 0.75 (low confidence)
 *   - 1+ high-severity missed symptoms found in raw text
 *   - 2+ counter-evidence items
 *
 * Returns challenged=false if no material counter-evidence is found
 * (Red Team clears the consensus).
 */
export declare function runRedTeamAgent(input: RedTeamInput): Promise<RedTeamVerdict>;


// ─── 6.3 · Consensus Failure Handler (Rec 6.1 + 6.2) ────────────────────────

/**
 * Per-disposition confidence floors.
 * Below these thresholds, physician escalation is mandatory regardless
 * of agent consensus.
 *
 * Basis: Epic CDSS thresholds + clinical AI literature.
 *
 *   ER_NOW:         0.85  — false negative = death
 *   ER_URGENT:      0.80
 *   URGENT_CARE:    0.75
 *   TELEHEALTH_NOW: 0.70
 *   NEXT_DAY:       0.65
 *   ROUTINE:        0.60
 *   SELF_CARE:      0.85  — false positive = missed emergency
 */
export declare const CONFIDENCE_THRESHOLDS: Record<string, number>;

/** Universal floor — below this, any disposition triggers physician review. */
export declare const CONFIDENCE_FLOOR: number;  // 0.72

export interface ConsensusInput {
  disposition:        string;
  confidence:         number;
  agentAgreementType: "unanimous" | "majority" | "split" | "unanimous_low";
  redFlagsAddressed:  string[];    // which red flags were explicitly addressed
  rawText:            string;
  extractedSymptoms:  string[];
  patientContext?:    string;      // e.g., demographics, relevant history
}

export interface HandledConsensus {
  finalDisposition:        DispositionTier;
  adjustedConfidence:      number;
  requiresPhysicianReview: boolean;
  reviewReasons:           string[];     // which conditions triggered review
  confidenceBelowFloor:    boolean;
  isRareCase:              boolean;      // matched rare complaint pattern
  demographicRiskFlag:     boolean;      // matched high-risk demographic pattern
  escalated:               boolean;      // disposition was escalated one tier
}

/**
 * Triggers physician review when any of:
 *   - Confidence below universal floor (0.72)
 *   - Confidence below disposition-specific threshold
 *   - All agents agreed but all reported low confidence (unanimous_low)
 *   - Rare case presentation detected (8 patterns checked)
 *   - High-risk demographic pattern in patientContext
 *   - Red flags detected in input but not addressed in consensus
 *
 * When physician review is required, disposition is escalated one tier
 * as a safety measure before physician review.
 */
export declare function handleConsensus(input: ConsensusInput): HandledConsensus;

/**
 * Convenience check — returns true if confidence is below the
 * disposition-specific threshold.
 */
export declare function requiresPhysicianEscalation(
  disposition: string,
  confidence:  number
): boolean;


// ─── 6.4 · Rare Case Patterns Checked ────────────────────────────────────────
/*
  The following rare presentation patterns trigger mandatory physician review:
    "rash with fever"
    "joint swelling multiple"
    "night sweats weight loss"
    "recurrent syncope"
    "hemoptysis"
    "painless jaundice"

  The following demographic patterns flag high-risk status:
    "elderly" / "over 70"
    "immunocompromised"
    "diabetic"
    "pregnant"
    "recent surgery"
    "on blood thinners" / "anticoagulant"
*/


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  POST /api/compliance/safety/red-team    — runs Red Team Agent
  POST /api/compliance/consensus/evaluate — runs Consensus Failure Handler
*/

// Placeholder — DispositionTier is defined in domain1-safety-interfaces.ts
declare enum DispositionTier {
  ER_NOW = "ER_NOW", ER_URGENT = "ER_URGENT", URGENT_CARE = "URGENT_CARE",
  TELEHEALTH_NOW = "TELEHEALTH_NOW", NEXT_DAY = "NEXT_DAY",
  ROUTINE = "ROUTINE", SELF_CARE = "SELF_CARE",
}
