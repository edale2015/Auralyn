/**
 * chiefResidentReflection.ts
 * Chief Resident cognitive layer — reflects on the assembled output
 * before it leaves the system, checking for internal consistency.
 *
 * Catches failures that individual engines miss:
 *   - Disposition mismatch with risk score
 *   - Recommendations contradicting red flags
 *   - Missing precautions when disposition is discharge
 *   - Disagreement between governance and treatment recommendations
 *   - Empty evidence for high-confidence differentials
 *
 * Returns a structured reflection that the brain includes in its output.
 */

export interface ReflectionInput {
  disposition?:            string;
  riskLevel?:              string;
  riskScore?:              number | null;
  redFlags?:               string[];
  differentials?:          any[];
  recommendations?:        any[];
  returnPrecautions?:      any[];
  governanceApproved?:     boolean;
  uncertainty?:            number;
  engineFailures?:         { engine: string }[];
  aggregatedDifferentials?: any[];
}

export interface ReflectionIssue {
  type:    string;
  message: string;
  action:  "warn" | "escalate" | "block";
}

export interface ReflectionOutput {
  issues:      ReflectionIssue[];
  escalated:   boolean;
  reflectionMs: number;
}

export function runChiefResidentReflection(input: ReflectionInput): ReflectionOutput {
  const start  = Date.now();
  const issues: ReflectionIssue[] = [];

  const safeDischarge = /outpatient|home_care|routine|followup/i.test(input.disposition ?? "");
  const isHighRisk    = input.riskLevel === "high" || (input.riskScore ?? 0) > 0.7;

  if (safeDischarge && isHighRisk) {
    issues.push({
      type:    "disposition_risk_mismatch",
      message: `Disposition "${input.disposition}" contradicts risk level "${input.riskLevel}" (score: ${input.riskScore?.toFixed(2)})`,
      action:  "escalate",
    });
  }

  if ((input.redFlags ?? []).length > 0 && safeDischarge) {
    issues.push({
      type:    "red_flag_discharge_conflict",
      message: `Red flags present (${input.redFlags?.slice(0, 2).join(", ")}) but disposition is discharge`,
      action:  "escalate",
    });
  }

  if (safeDischarge && (!input.returnPrecautions || input.returnPrecautions.length === 0)) {
    issues.push({
      type:    "missing_return_precautions",
      message: "Discharge disposition without return precautions — patient may not know when to return",
      action:  "warn",
    });
  }

  if (!input.governanceApproved && safeDischarge) {
    issues.push({
      type:    "governance_discharge_conflict",
      message: "Governance did not approve this case but disposition is discharge",
      action:  "escalate",
    });
  }

  const topDiff = input.aggregatedDifferentials?.[0] ?? input.differentials?.[0];
  if (topDiff) {
    const topScore = topDiff.score ?? topDiff.posteriorProbability ?? 0;
    if (topScore > 0.7 && (!input.recommendations || input.recommendations.length === 0)) {
      issues.push({
        type:    "high_confidence_no_treatment",
        message: `High confidence diagnosis (${(topScore * 100).toFixed(0)}%) with no treatment recommendations`,
        action:  "warn",
      });
    }
  }

  const criticalFailures = (input.engineFailures ?? []).filter((f) =>
    ["riskStratificationEngine", "clinicalGovernanceEngine", "dispositionCalibrationEngine",
     "computeDifferentialProbabilities", "detectRedFlags"].includes(f.engine),
  );
  if (criticalFailures.length > 0) {
    issues.push({
      type:    "critical_engine_failures",
      message: `Critical engines failed: ${criticalFailures.map((f) => f.engine).join(", ")}`,
      action:  "escalate",
    });
  }

  if ((input.uncertainty ?? 0) > 0.85) {
    issues.push({
      type:    "extreme_uncertainty",
      message: `Uncertainty ${(input.uncertainty! * 100).toFixed(0)}% — output may be unreliable`,
      action:  "escalate",
    });
  }

  const escalated = issues.some((i) => i.action === "escalate" || i.action === "block");

  return {
    issues,
    escalated,
    reflectionMs: Date.now() - start,
  };
}
