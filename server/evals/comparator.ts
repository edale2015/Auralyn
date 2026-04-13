/**
 * comparator.ts — Blind comparator for skill A/B testing
 *
 * Article 29 (Skill Evals): "Skill-creator uses a blind comparator agent for
 *  A/B testing: it sees two outputs but doesn't know which came from the skill
 *  version. This prevents the grader from being biased toward whichever output
 *  it sees second or whichever it associates with 'the improved version'."
 *
 * Article 28a (Eval Engine): "compareOutputs(expected, withSkill, withoutSkill)
 *  Scoring: diagnosis match = 0.4, disposition match = 0.4, orders match = 0.2"
 *
 * Clinical outputs scored across three dimensions:
 *   diagnosis    (0.40) — primary diagnosis correct
 *   disposition  (0.40) — admit/discharge/transfer correct
 *   orders       (0.20) — order set matches expected
 *
 * Pass threshold: ≥ 0.9 (article default)
 *
 * Blind guarantee:
 *   The comparator receives (expected, outputA, outputB). It does NOT receive
 *   labels identifying which output has the skill loaded. The label shuffle is
 *   handled by evalEngine.ts AFTER the comparator returns scores.
 */

export interface ClinicalOutput {
  diagnosis?:   string;
  disposition?: string;
  orders?:      string[];
  triage?:      string;
  score?:       number;
  reasoning?:   string;
  raw?:         unknown;
}

export interface ComparisonResult {
  passed:        boolean;          // scoreA >= passThreshold
  scoreA:        number;           // score for output A (blind — no label)
  scoreB:        number;           // score for output B (blind — no label)
  winnerLabel:   "A" | "B" | "tie";
  diff: {
    expected:    ClinicalOutput;
    outputA:     ClinicalOutput;
    outputB:     ClinicalOutput;
    breakdown:   ScoringBreakdown;
  };
}

export interface ScoringBreakdown {
  diagnosisA:   number;   // 0 or 0.40
  diagnosisB:   number;
  dispositionA: number;   // 0 or 0.40
  dispositionB: number;
  ordersA:      number;   // 0 to 0.20
  ordersB:      number;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

export function scoreOutput(expected: ClinicalOutput, actual: ClinicalOutput): number {
  let score = 0;

  // Diagnosis match (0.40)
  if (
    expected.diagnosis &&
    actual.diagnosis &&
    normalize(actual.diagnosis) === normalize(expected.diagnosis)
  ) {
    score += 0.4;
  }

  // Disposition match (0.40)
  if (
    expected.disposition &&
    actual.disposition &&
    normalize(actual.disposition) === normalize(expected.disposition)
  ) {
    score += 0.4;
  }

  // Orders match (0.20) — partial credit for each matched order
  if (expected.orders && expected.orders.length > 0 && actual.orders) {
    const expectedNorm = expected.orders.map(normalize);
    const actualNorm   = actual.orders.map(normalize);
    const matched      = expectedNorm.filter((o) => actualNorm.includes(o)).length;
    score += 0.2 * (matched / expected.orders.length);
  } else if (!expected.orders || expected.orders.length === 0) {
    // No orders expected — full credit if none given
    if (!actual.orders || actual.orders.length === 0) score += 0.2;
  }

  return Math.round(score * 1000) / 1000;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ── Blind comparator ──────────────────────────────────────────────────────────

export function compareOutputs(
  expected:    ClinicalOutput,
  outputA:     ClinicalOutput,
  outputB:     ClinicalOutput,
  passThreshold = 0.9,
): ComparisonResult {
  // Blind: comparator scores A and B without knowing which has the skill
  const scoreA = scoreOutput(expected, outputA);
  const scoreB = scoreOutput(expected, outputB);

  const diagnosisA   = expected.diagnosis && normalize(outputA.diagnosis ?? "") === normalize(expected.diagnosis ?? "") ? 0.4 : 0;
  const diagnosisB   = expected.diagnosis && normalize(outputB.diagnosis ?? "") === normalize(expected.diagnosis ?? "") ? 0.4 : 0;
  const dispositionA = expected.disposition && normalize(outputA.disposition ?? "") === normalize(expected.disposition ?? "") ? 0.4 : 0;
  const dispositionB = expected.disposition && normalize(outputB.disposition ?? "") === normalize(expected.disposition ?? "") ? 0.4 : 0;
  const ordersA      = scoreA - diagnosisA - dispositionA;
  const ordersB      = scoreB - diagnosisB - dispositionB;

  const winnerLabel: "A" | "B" | "tie" = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "tie";

  return {
    passed: scoreA >= passThreshold,
    scoreA,
    scoreB,
    winnerLabel,
    diff: {
      expected,
      outputA,
      outputB,
      breakdown: {
        diagnosisA:   Math.round(diagnosisA * 1000) / 1000,
        diagnosisB:   Math.round(diagnosisB * 1000) / 1000,
        dispositionA: Math.round(dispositionA * 1000) / 1000,
        dispositionB: Math.round(dispositionB * 1000) / 1000,
        ordersA:      Math.round(Math.max(0, ordersA) * 1000) / 1000,
        ordersB:      Math.round(Math.max(0, ordersB) * 1000) / 1000,
      },
    },
  };
}

// ── Skill necessity analysis ───────────────────────────────────────────────────
// Article 29: "If with-skill and without-skill pass rates are identical,
//  your tests are too easy or the skill isn't adding value."

export type SkillNecessityVerdict =
  | "essential"    // skill significantly outperforms base model
  | "helpful"      // skill improves some cases
  | "redundant"    // no difference — model may have caught up
  | "obsolete"     // base model actually performs better (skill adds noise)
  | "indeterminate"; // not enough data

export function assessSkillNecessity(
  withSkillScores:    number[],
  withoutSkillScores: number[],
): { verdict: SkillNecessityVerdict; delta: number; analysis: string } {
  if (withSkillScores.length === 0) return { verdict: "indeterminate", delta: 0, analysis: "No eval data" };

  const avgWith    = avg(withSkillScores);
  const avgWithout = avg(withoutSkillScores);
  const delta      = Math.round((avgWith - avgWithout) * 1000) / 1000;

  let verdict: SkillNecessityVerdict;
  let analysis: string;

  if (delta > 0.2) {
    verdict  = "essential";
    analysis = `Skill adds +${delta} accuracy. Clear value — keep and maintain.`;
  } else if (delta > 0.05) {
    verdict  = "helpful";
    analysis = `Skill adds modest +${delta}. Useful but validate against model updates.`;
  } else if (Math.abs(delta) <= 0.05) {
    verdict  = "redundant";
    analysis = `Delta is ${delta}. Tests may be too easy, or the model has absorbed this skill's knowledge. Capability uplift skill may have reached natural expiration.`;
  } else {
    verdict  = "obsolete";
    analysis = `Skill hurts by ${Math.abs(delta)}. Remove or rewrite — skill is adding noise.`;
  }

  return { verdict, delta, analysis };
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
