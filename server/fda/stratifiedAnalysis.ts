import type { ValidationResult } from "./validationRunner";
import type { FDAMetrics } from "./metricsEngine";
import { computeMetrics } from "./metricsEngine";

export interface StratifiedGroup {
  label: string;
  count: number;
  results: ValidationResult[];
  metrics: FDAMetrics;
}

export interface StratifiedAnalysis {
  pediatric: StratifiedGroup;
  adult: StratifiedGroup;
  highRisk: StratifiedGroup;
  lowRisk: StratifiedGroup;
  summary: {
    totalGroups: number;
    groupsPassing: number;
    worstGroup: string;
    bestGroup: string;
  };
}

function makeGroup(label: string, results: ValidationResult[], threshold = 0.8): StratifiedGroup {
  return {
    label,
    count: results.length,
    results,
    metrics: computeMetrics(results, threshold),
  };
}

export function stratify(results: ValidationResult[], threshold = 0.8): StratifiedAnalysis {
  const pediatric: ValidationResult[] = [];
  const adult: ValidationResult[] = [];
  const highRisk: ValidationResult[] = [];
  const lowRisk: ValidationResult[] = [];

  for (const r of results) {
    const age = r.input?.age ?? r.input?.answers?.age;

    if (typeof age === "number" && age < 18) {
      pediatric.push(r);
    } else {
      adult.push(r);
    }

    if (r.safety === "HIGH" || r.safety === "CRITICAL") {
      highRisk.push(r);
    } else {
      lowRisk.push(r);
    }
  }

  const groups = {
    pediatric: makeGroup("Pediatric (age < 18)", pediatric, threshold),
    adult: makeGroup("Adult (age ≥ 18)", adult, threshold),
    highRisk: makeGroup("High Risk (safety = HIGH/CRITICAL)", highRisk, threshold),
    lowRisk: makeGroup("Low/Standard Risk", lowRisk, threshold),
  };

  const groupList = Object.entries(groups) as [string, StratifiedGroup][];
  const withData = groupList.filter(([, g]) => g.count > 0);

  const sorted = withData.sort((a, b) => a[1].metrics.accuracy - b[1].metrics.accuracy);

  return {
    ...groups,
    summary: {
      totalGroups: withData.length,
      groupsPassing: withData.filter(([, g]) => g.metrics.passesThreshold).length,
      worstGroup: sorted[0]?.[0] ?? "n/a",
      bestGroup: sorted[sorted.length - 1]?.[0] ?? "n/a",
    },
  };
}
