/**
 * server/clinical/conflictResolver.ts — Hybrid engine conflict arbitration
 *
 * FIX (Code Review Issue #14):
 *   Previously only ER_NOW was hard-locked against probabilistic override.
 *   URGENT_24H could theoretically be overridden by a high-confidence probabilistic
 *   output that chose a lower acuity — even though escalationMax() provided a floor,
 *   the resolution reason was mis-attributed and the safety boundary was implicit.
 *
 *   Fixed:
 *   1. Hard-lock extended to all URGENT dispositions (ER_NOW + URGENT_24H).
 *      Both are treated as deterministic safety outputs that probabilistic engines
 *      cannot downgrade, regardless of confidence level.
 *   2. Probabilistic CAN escalate beyond URGENT_24H (e.g. → ER_NOW) if confidence
 *      exceeds the threshold — escalation-only, never de-escalation.
 *   3. MONITOR is also locked when urgency is "high" or "critical" per rule engine flags.
 *   4. Override reason taxonomy extended with DETERMINISTIC_URGENT_SAFETY.
 *   5. escalationMax is now an explicit contract (never de-escalate) and its use
 *      is annotated on every path so the logic is auditable.
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
  | "DETERMINISTIC_HARD_SAFETY"    // ER_NOW — absolute: not negotiable under any condition
  | "DETERMINISTIC_URGENT_SAFETY"  // URGENT_24H or flagged MONITOR — cannot be downgraded
  | "PROBABILISTIC_HIGH_CONFIDENCE"// P > threshold and can only escalate (never de-escalate)
  | "DETERMINISTIC_SAFE_DEFAULT"   // below-threshold confidence: always take conservative path
  | "NO_PROBABILISTIC_INPUT";      // probabilistic engine produced no output

export interface ConflictResolutionResult {
  final:          DeterministicOutput | ProbabilisticOutput;
  overrideReason: OverrideReason;
  agreed:         boolean;
  auditTrail: {
    deterministic:       DeterministicOutput;
    probabilistic:       ProbabilisticOutput | null;
    confidenceThreshold: number;
    resolvedAt:          string;
    safetyLockApplied:   boolean;
  };
}

const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/** Disposition severity rank (higher = more urgent) */
const DISPOSITION_RANK: Record<Disposition, number> = {
  ER_NOW:      4,
  URGENT_24H:  3,
  MONITOR:     2,
  ROUTINE_72H: 1,
  SELF_CARE:   0,
};

/** Return the more urgent of two dispositions — never de-escalate */
function escalationMax(a: Disposition, b: Disposition | undefined): Disposition {
  if (!b) return a;
  return DISPOSITION_RANK[a] >= DISPOSITION_RANK[b] ? a : b;
}

/**
 * isHardLocked — determines if the deterministic disposition must not be
 * overridden or downgraded by probabilistic output.
 *
 * Hard-locked tiers (Issue #14 fix):
 *   ER_NOW:     absolute lock — life-threatening, no override possible
 *   URGENT_24H: urgent lock — high-acuity, probabilistic can only escalate further
 *   MONITOR (with high/critical urgency flags): safety monitoring lock
 */
function isHardLocked(det: DeterministicOutput): boolean {
  if (det.disposition === "ER_NOW")     return true;
  if (det.disposition === "URGENT_24H") return true;
  if (
    det.disposition === "MONITOR" &&
    (det.urgency === "high" || det.urgency === "critical")
  ) return true;
  return false;
}

/**
 * resolveConflict — arbitrate between deterministic and probabilistic engines.
 *
 * Resolution hierarchy (strict, ordered):
 *   1. Hard safety lock  — ER_NOW / URGENT_24H / flagged MONITOR: deterministic always wins
 *      (probabilistic may escalate FURTHER, but never downgrade)
 *   2. No probabilistic  — default to deterministic
 *   3. High-confidence   — probabilistic wins, subject to escalation floor
 *   4. Safe default      — deterministic wins (conservative)
 */
export function resolveConflict(input: {
  deterministic:       DeterministicOutput;
  probabilistic:       ProbabilisticOutput | null;
  confidenceThreshold?: number;
}): ConflictResolutionResult {
  const { deterministic, probabilistic } = input;
  const threshold  = input.confidenceThreshold ?? HIGH_CONFIDENCE_THRESHOLD;
  const resolvedAt = new Date().toISOString();
  const locked     = isHardLocked(deterministic);

  // ── Rule 1: Hard safety lock (ER_NOW, URGENT_24H, flagged MONITOR) ────────
  if (locked) {
    // Even when locked, probabilistic CAN escalate further (e.g. URGENT_24H → ER_NOW)
    // but NEVER downgrade the deterministic floor.
    const probDisp = probabilistic?.disposition;
    const finalDisp = probDisp
      ? escalationMax(deterministic.disposition, probDisp)
      : deterministic.disposition;

    const reason: OverrideReason =
      deterministic.disposition === "ER_NOW"
        ? "DETERMINISTIC_HARD_SAFETY"
        : "DETERMINISTIC_URGENT_SAFETY";

    return {
      final:          { ...deterministic, disposition: finalDisp },
      overrideReason: reason,
      agreed:         probabilistic?.disposition === finalDisp,
      auditTrail: {
        deterministic,
        probabilistic:       probabilistic ?? null,
        confidenceThreshold: threshold,
        resolvedAt,
        safetyLockApplied:   true,
      },
    };
  }

  // ── Rule 2: No probabilistic output ───────────────────────────────────────
  if (!probabilistic || probabilistic.confidence === undefined) {
    return {
      final:          deterministic,
      overrideReason: "NO_PROBABILISTIC_INPUT",
      agreed:         false,
      auditTrail: {
        deterministic,
        probabilistic:       null,
        confidenceThreshold: threshold,
        resolvedAt,
        safetyLockApplied:   false,
      },
    };
  }

  // ── Rule 3: High-confidence probabilistic (escalation-only floor) ─────────
  if (probabilistic.confidence >= threshold) {
    const probDisp  = probabilistic.disposition ?? deterministic.disposition;
    // SAFETY: probabilistic can escalate but never downgrade below deterministic floor
    const finalDisp = escalationMax(deterministic.disposition, probDisp);

    return {
      final:          { ...probabilistic, disposition: finalDisp },
      overrideReason: "PROBABILISTIC_HIGH_CONFIDENCE",
      agreed:         deterministic.disposition === probDisp,
      auditTrail: {
        deterministic,
        probabilistic,
        confidenceThreshold: threshold,
        resolvedAt,
        safetyLockApplied:   false,
      },
    };
  }

  // ── Rule 4: Below-threshold confidence — take conservative deterministic ──
  return {
    final:          deterministic,
    overrideReason: "DETERMINISTIC_SAFE_DEFAULT",
    agreed:         deterministic.disposition === probabilistic.disposition,
    auditTrail: {
      deterministic,
      probabilistic,
      confidenceThreshold: threshold,
      resolvedAt,
      safetyLockApplied:   false,
    },
  };
}
