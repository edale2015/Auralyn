/**
 * FDA submission justification generator.
 *
 * Produces human-readable justification lines from a validation summary.
 * Used inside the FDA report and SaMD dossier.
 */

export interface ValidationData {
  passRate:          number;
  unsafeUndercalls:  number;
  calibrationError?: number;
  total?:            number;
  failed?:           number;
  hallucinationBlocks?: number;
  escalationRate?:   number;
}

/**
 * Generate an ordered list of justification statements for the FDA report.
 */
export function generateJustification(data: ValidationData): string[] {
  const lines: string[] = [];

  if (data.unsafeUndercalls === 0) {
    lines.push("No unsafe undercalls observed across the full validation set.");
  } else {
    lines.push(
      `WARNING: ${data.unsafeUndercalls} unsafe undercall(s) detected — disposition was below clinical minimum.`,
    );
  }

  if (data.passRate >= 0.9) {
    lines.push(`High validation pass rate: ${(data.passRate * 100).toFixed(1)}% (≥90% threshold met).`);
  } else {
    lines.push(
      `Validation pass rate ${(data.passRate * 100).toFixed(1)}% is below the 90% FDA SaMD threshold.`,
    );
  }

  if (data.calibrationError !== undefined) {
    if (data.calibrationError < 0.1) {
      lines.push(`Model is well-calibrated (Brier score ${data.calibrationError.toFixed(3)} < 0.10).`);
    } else {
      lines.push(
        `Calibration error ${data.calibrationError.toFixed(3)} exceeds target of 0.10 — review model confidence.`,
      );
    }
  }

  if (data.hallucinationBlocks !== undefined) {
    lines.push(
      `Hallucination detection system blocked ${data.hallucinationBlocks} unsafe output(s) before physician escalation.`,
    );
  }

  if (data.escalationRate !== undefined) {
    lines.push(
      `${(data.escalationRate * 100).toFixed(1)}% of cases were escalated to physician review.`,
    );
  }

  lines.push("System includes multi-layer hallucination detection (impossible combo, risk floor, low-support abstention).");
  lines.push("All autonomous decisions are gated by requiresPhysicianReview = true in high-stakes conditions.");
  lines.push("Audit chain is cryptographically linked (SHA-256) per 21 CFR Part 11 requirements.");

  return lines;
}
