/**
 * shadowEvaluator.ts
 * Shadow-run evaluator — runs the brain with current engines and compares
 * against a "reference" baseline output to detect regressions.
 *
 * Usage:
 *   1. A shadow run is triggered with the same input as the primary run.
 *   2. The evaluator compares key output fields.
 *   3. Significant divergence is flagged in the telemetry stream.
 *
 * This is essential for safely deploying engine updates — you can shadow-test
 * new engines against the existing ones before switching primary traffic.
 */

export interface ShadowEvalInput {
  primary:   Record<string, any>;
  shadow:    Record<string, any>;
  traceId?:  string;
}

export interface ShadowDivergence {
  field:       string;
  primaryVal:  any;
  shadowVal:   any;
  delta?:      number;
  significant: boolean;
}

export interface ShadowEvalResult {
  traceId?:      string;
  divergences:   ShadowDivergence[];
  hasCritical:   boolean;
  summaryScore:  number;
  recommendation: "deploy" | "investigate" | "block";
}

const NUMERIC_THRESHOLD = 0.1;
const CRITICAL_FIELDS   = ["disposition", "riskLevel", "governanceApproved"];

export function runShadowEvaluation(input: ShadowEvalInput): ShadowEvalResult {
  const { primary, shadow, traceId } = input;
  const divergences: ShadowDivergence[] = [];

  const fieldsToCompare = [
    "disposition",
    "riskLevel",
    "riskScore",
    "uncertainty",
    "degraded",
    "governanceApproved",
    "engineFailures",
  ];

  for (const field of fieldsToCompare) {
    const pVal = primary[field];
    const sVal = shadow[field];

    if (pVal === undefined && sVal === undefined) continue;

    if (typeof pVal === "number" && typeof sVal === "number") {
      const delta = Math.abs(pVal - sVal);
      if (delta > NUMERIC_THRESHOLD) {
        divergences.push({
          field,
          primaryVal:  pVal,
          shadowVal:   sVal,
          delta,
          significant: delta > NUMERIC_THRESHOLD * 2 || CRITICAL_FIELDS.includes(field),
        });
      }
    } else if (pVal !== sVal) {
      divergences.push({
        field,
        primaryVal:  pVal,
        shadowVal:   sVal,
        significant: CRITICAL_FIELDS.includes(field),
      });
    }
  }

  const primaryDiffCount = (primary.differential ?? primary.differentials ?? []).length;
  const shadowDiffCount  = (shadow.differential  ?? shadow.differentials  ?? []).length;
  if (Math.abs(primaryDiffCount - shadowDiffCount) > 2) {
    divergences.push({
      field:       "differentialCount",
      primaryVal:  primaryDiffCount,
      shadowVal:   shadowDiffCount,
      delta:       Math.abs(primaryDiffCount - shadowDiffCount),
      significant: true,
    });
  }

  const hasCritical    = divergences.some((d) => d.significant);
  const summaryScore   = divergences.length === 0 ? 1 :
    Math.max(0, 1 - divergences.filter((d) => d.significant).length * 0.25);

  const recommendation: ShadowEvalResult["recommendation"] =
    hasCritical   ? "investigate" :
    summaryScore >= 0.75 ? "deploy"  : "block";

  return { traceId, divergences, hasCritical, summaryScore, recommendation };
}
