/**
 * FDA Validator — SaMD accuracy and safety validation layer.
 * Wraps the richer validationRunner with a simple pass/fail interface
 * matching the spec, plus extended clinical safety metrics.
 */

export interface CaseResult {
  match:            boolean;
  expected:         string;
  actual:           string;
  safetyMiss?:      boolean; // true if actual missed a dangerous diagnosis
}

export interface ValidationReport {
  accuracy:       number;
  status:         "PASS" | "FAIL" | "REVIEW";
  total:          number;
  correct:        number;
  incorrect:      number;
  safetyMisses:   number;
  threshold:      number;
  computedAt:     string;
}

export class FDAValidator {
  validate(results: CaseResult[], threshold = 0.8): ValidationReport {
    const total       = results.length;
    if (total === 0) {
      return { accuracy: 0, status: "FAIL", total: 0, correct: 0, incorrect: 0, safetyMisses: 0, threshold, computedAt: new Date().toISOString() };
    }

    const correct      = results.filter((r) => r.match).length;
    const safetyMisses = results.filter((r) => r.safetyMiss).length;
    const accuracy     = correct / total;

    let status: ValidationReport["status"];
    if (accuracy >= threshold && safetyMisses === 0) status = "PASS";
    else if (accuracy >= threshold * 0.9)             status = "REVIEW";
    else                                              status = "FAIL";

    return { accuracy: Number(accuracy.toFixed(4)), status, total, correct, incorrect: total - correct, safetyMisses, threshold, computedAt: new Date().toISOString() };
  }

  /** Quick boolean validate from raw accuracy number */
  validateAccuracy(accuracy: number, threshold = 0.8): boolean {
    return accuracy >= threshold;
  }

  /** Build CaseResults from golden-case comparison arrays */
  compareResults(
    expected: Array<{ diagnosis?: string; disposition?: string }>,
    actual:   Array<{ diagnosis?: string; disposition?: string }>,
    dangerousDiagnoses = ["ACS", "PE", "Sepsis", "Meningitis", "Stroke"]
  ): CaseResult[] {
    return expected.map((exp, i) => {
      const act = actual[i];
      if (!act) return { match: false, expected: JSON.stringify(exp), actual: "missing", safetyMiss: true };

      const dxMatch   = !exp.diagnosis   || exp.diagnosis   === act.diagnosis;
      const dispMatch = !exp.disposition || exp.disposition === act.disposition;
      const match     = dxMatch && dispMatch;

      const safetyMiss = !match && dangerousDiagnoses.some(
        (d) => exp.diagnosis?.includes(d) && act.diagnosis !== exp.diagnosis
      );

      return { match, expected: JSON.stringify(exp), actual: JSON.stringify(act), safetyMiss };
    });
  }
}

export const fdaValidator = new FDAValidator();
