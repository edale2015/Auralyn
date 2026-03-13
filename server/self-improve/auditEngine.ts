import { ImprovementContract, ALL_CONTRACTS, LearningDomain } from "./componentContracts";

export interface AuditResult {
  component_name: string;
  display_name: string;
  domain: LearningDomain;
  layer: string;
  improvement_priority: string;
  checks: {
    emits_trace: boolean;
    has_tunable_parameters: boolean;
    has_proposal_targets: boolean;
    has_regression_suite: boolean;
    learning_enabled: boolean;
    has_safety_guard: boolean;
  };
  score: number;
  max_score: number;
  pct: number;
  self_improving: boolean;
  status: "fully_capable" | "capable" | "partial" | "not_capable";
  known_gaps: string[];
  missing_capabilities: string[];
}

export interface SystemAuditReport {
  generated_at: string;
  total_components: number;
  fully_capable: number;
  capable: number;
  partial: number;
  not_capable: number;
  system_score: number;
  system_max: number;
  system_pct: number;
  system_self_improving: boolean;
  by_domain: Record<LearningDomain, { count: number; avg_score: number; components: string[] }>;
  results: AuditResult[];
  top_gaps: Array<{ gap: string; components_affected: string[]; count: number }>;
  critical_missing: string[];
}

const CHECK_LABELS: Record<string, string> = {
  emits_trace: "emits trace data",
  has_tunable_parameters: "has tunable parameters",
  has_proposal_targets: "has proposal targets",
  has_regression_suite: "has regression test suite",
  learning_enabled: "learning enabled",
  has_safety_guard: "has safety guard",
};

export function auditComponent(contract: ImprovementContract): AuditResult {
  const checks = {
    emits_trace: contract.emits_trace,
    has_tunable_parameters: contract.tunable_parameters.length > 0,
    has_proposal_targets: contract.proposal_targets.length > 0,
    has_regression_suite: contract.regression_suite.length > 0,
    learning_enabled: contract.learning_enabled,
    has_safety_guard: contract.safety_guard,
  };

  const score = Object.values(checks).filter(Boolean).length;
  const max_score = Object.keys(checks).length;
  const pct = Math.round((score / max_score) * 100);

  const status: AuditResult["status"] =
    score === max_score ? "fully_capable" :
    score >= 5 ? "capable" :
    score >= 3 ? "partial" :
    "not_capable";

  const missing_capabilities = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => CHECK_LABELS[k] ?? k);

  return {
    component_name: contract.component_name,
    display_name: contract.display_name,
    domain: contract.domain,
    layer: contract.layer,
    improvement_priority: contract.improvement_priority,
    checks,
    score,
    max_score,
    pct,
    self_improving: score >= 5,
    status,
    known_gaps: contract.known_gaps ?? [],
    missing_capabilities,
  };
}

export function runSystemAudit(): SystemAuditReport {
  const results = ALL_CONTRACTS.map(auditComponent);
  const total = results.length;

  const counts = { fully_capable: 0, capable: 0, partial: 0, not_capable: 0 };
  for (const r of results) counts[r.status]++;

  const systemScore = results.reduce((s, r) => s + r.score, 0);
  const systemMax = results.reduce((s, r) => s + r.max_score, 0);
  const systemPct = Math.round((systemScore / systemMax) * 100);

  const domainMap: Record<string, { count: number; total: number; components: string[] }> = {};
  for (const r of results) {
    if (!domainMap[r.domain]) domainMap[r.domain] = { count: 0, total: 0, components: [] };
    domainMap[r.domain].count++;
    domainMap[r.domain].total += r.score;
    domainMap[r.domain].components.push(r.display_name);
  }
  const by_domain: any = {};
  for (const [domain, d] of Object.entries(domainMap)) {
    by_domain[domain] = {
      count: d.count,
      avg_score: Math.round((d.total / (d.count * 6)) * 100) / 100,
      components: d.components,
    };
  }

  const gapCounts: Record<string, string[]> = {};
  for (const r of results) {
    for (const gap of r.known_gaps) {
      if (!gapCounts[gap]) gapCounts[gap] = [];
      gapCounts[gap].push(r.display_name);
    }
    for (const mc of r.missing_capabilities) {
      const key = `Missing: ${mc}`;
      if (!gapCounts[key]) gapCounts[key] = [];
      gapCounts[key].push(r.display_name);
    }
  }
  const top_gaps = Object.entries(gapCounts)
    .map(([gap, comps]) => ({ gap, components_affected: comps, count: comps.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const critical_missing = results
    .filter(r => r.improvement_priority === "critical" && !r.self_improving)
    .map(r => r.display_name);

  return {
    generated_at: new Date().toISOString(),
    total_components: total,
    fully_capable: counts.fully_capable,
    capable: counts.capable,
    partial: counts.partial,
    not_capable: counts.not_capable,
    system_score: systemScore,
    system_max: systemMax,
    system_pct: systemPct,
    system_self_improving: systemPct >= 75,
    by_domain,
    results,
    top_gaps,
    critical_missing,
  };
}
