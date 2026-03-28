/**
 * Hybrid Engine Conflict Resolver
 *
 * Arbitrates between deterministic rule-engine outputs and probabilistic
 * (Bayesian / LLM) outputs. The resolution hierarchy is strict:
 *
 *   1. HARD SAFETY OVERRIDE — deterministic ER_NOW always wins (non-negotiable)
 *   2. HIGH-CONFIDENCE PROBABILISTIC — if Bayesian/LLM confidence > 0.85
 *   3. SAFE DEFAULT — defer to deterministic (the conservative fallback)
 *
 * Every resolution is fully auditable via an `overrideReason` field so
 * physicians and regulators can trace every decision.
 */

export type Disposition = "ER_NOW" | "URGENT_24H" | "ROUTINE_72H" | "SELF_CARE" | "MONITOR";

export interface DeterministicOutput {
  disposition:  Disposition;
  diagnosis?:   string;
  urgency?:     "critical" | "high" | "moderate" | "low";
  flags?:       string[];
  source?:      string;
}

export interface ProbabilisticOutput {
  disposition?:  Disposition;
  diagnosis?:    string;
  confidence:    number;   // 0–1
  differential?: Array<{ diagnosis: string; probability: number }>;
  source?:       string;
}

export type OverrideReason =
  | "DETERMINISTIC_HARD_SAFETY"    // ER_NOW from rule engine — never negotiable
  | "PROBABILISTIC_HIGH_CONFIDENCE" // P > 0.85 — model is very sure
  | "DETERMINISTIC_SAFE_DEFAULT"   // fallback to the safer rule-based decision
  | "NO_PROBABILISTIC_INPUT";      // probabilistic engine produced nothing

export interface ConflictResolutionResult {
  final:          DeterministicOutput | ProbabilisticOutput;
  overrideReason: OverrideReason;
  agreed:         boolean;   // true when both engines picked same disposition
  auditTrail: {
    deterministic: DeterministicOutput;
    probabilistic: ProbabilisticOutput | null;
    confidenceThreshold: number;
    resolvedAt: string;
  };
}

const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Resolve a conflict between the deterministic and probabilistic engines.
 *
 * @param deterministic — output from the rule-based safety engine
 * @param probabilistic — output from the Bayesian/LLM engine (nullable)
 * @param confidenceThreshold — override threshold, default 0.85
 */
export function resolveConflict(input: {
  deterministic:    DeterministicOutput;
  probabilistic:    ProbabilisticOutput | null;
  confidenceThreshold?: number;
}): ConflictResolutionResult {
  const { deterministic, probabilistic } = input;
  const threshold = input.confidenceThreshold ?? HIGH_CONFIDENCE_THRESHOLD;
  const resolvedAt = new Date().toISOString();

  // ── Rule 1: Hard safety override ──────────────────────────────────────────
  if (deterministic.disposition === "ER_NOW") {
    return {
      final:          deterministic,
      overrideReason: "DETERMINISTIC_HARD_SAFETY",
      agreed:         probabilistic?.disposition === "ER_NOW",
      auditTrail:     { deterministic, probabilistic: probabilistic ?? null, confidenceThreshold: threshold, resolvedAt },
    };
  }

  // ── Rule 2: No probabilistic output ───────────────────────────────────────
  if (!probabilistic || probabilistic.confidence === undefined) {
    return {
      final:          deterministic,
      overrideReason: "NO_PROBABILISTIC_INPUT",
      agreed:         false,
      auditTrail:     { deterministic, probabilistic: null, confidenceThreshold: threshold, resolvedAt },
    };
  }

  // ── Rule 3: High-confidence probabilistic ─────────────────────────────────
  // Safety guard: probabilistic can only ESCALATE, never de-escalate below URGENT_24H
  if (probabilistic.confidence >= threshold) {
    const probDisp   = probabilistic.disposition ?? deterministic.disposition;
    const finalDisp  = escalationMax(deterministic.disposition, probDisp);

    return {
      final: { ...probabilistic, disposition: finalDisp },
      overrideReason: "PROBABILISTIC_HIGH_CONFIDENCE",
      agreed: deterministic.disposition === probDisp,
      auditTrail: { deterministic, probabilistic, confidenceThreshold: threshold, resolvedAt },
    };
  }

  // ── Rule 4: Default to safe deterministic ────────────────────────────────
  return {
    final:          deterministic,
    overrideReason: "DETERMINISTIC_SAFE_DEFAULT",
    agreed:         deterministic.disposition === probabilistic.disposition,
    auditTrail:     { deterministic, probabilistic, confidenceThreshold: threshold, resolvedAt },
  };
}

/** Return the more urgent of two dispositions (never allow de-escalation) */
function escalationMax(a: Disposition, b: Disposition | undefined): Disposition {
  const rank: Record<Disposition, number> = { ER_NOW: 4, URGENT_24H: 3, MONITOR: 2, ROUTINE_72H: 1, SELF_CARE: 0 };
  if (!b) return a;
  return (rank[a] >= rank[b]) ? a : b;
}
