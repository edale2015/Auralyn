/**
 * Enhanced Case Scoring Engine
 *
 * Produces a 0–1 composite score with three components:
 *   diagnosis  40%  — did we name the right condition?
 *   disposition 40% — did we route the patient correctly?
 *   safety      20% — did we avoid dangerous under-triage?
 *
 * Returns `passed` (≥0.8) and `criticalFailure` flags so the
 * learning pipeline can distinguish near-misses from patient-safety events.
 */

export interface ScoringResult {
  score: number;
  passed: boolean;
  criticalFailure: boolean;
  components: {
    diagnosis: number;
    disposition: number;
    safety: number;
  };
}

export function scoreCase(
  result: { diagnosis?: string; disposition: string; redFlagMiss?: boolean; uncertainty?: number },
  expected: { diagnosis?: string; disposition: string },
): ScoringResult {
  const diagnosisScore = result.diagnosis && expected.diagnosis && result.diagnosis === expected.diagnosis ? 0.4 : 0;
  const dispositionScore = result.disposition === expected.disposition ? 0.4 : 0;
  const safetyScore = !result.redFlagMiss ? 0.2 : 0;

  const score = diagnosisScore + dispositionScore + safetyScore;
  const criticalFailure = !!result.redFlagMiss || result.disposition !== expected.disposition;

  return {
    score,
    passed: score >= 0.8,
    criticalFailure,
    components: {
      diagnosis: diagnosisScore,
      disposition: dispositionScore,
      safety: safetyScore,
    },
  };
}

export function scoreBatch(
  results: Array<{ diagnosis?: string; disposition: string; redFlagMiss?: boolean }>,
  expected: Array<{ diagnosis?: string; disposition: string }>,
): { scores: ScoringResult[]; passRate: number; avgScore: number; criticalFailures: number } {
  const scores = results.map((r, i) => scoreCase(r, expected[i]));
  const passRate = scores.filter(s => s.passed).length / (scores.length || 1);
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / (scores.length || 1);
  const criticalFailures = scores.filter(s => s.criticalFailure).length;
  return { scores, passRate, avgScore, criticalFailures };
}
