import { computeClinicianPerformance } from "./performanceEngine";

export interface CoachingReport {
  clinicianId: string;
  priority: "low" | "medium" | "high" | "critical";
  metrics: {
    accuracyScore: number;
    escalationRate: number;
    avgDecisionTimeMs: number;
    denialRate: number;
    totalCases: number;
    performanceGrade: string;
    tier: string;
  };
  ruleBasedFlags: string[];
  recommendations: string[];
  strengths: string[];
  focusArea: string;
  actionPlan: string[];
  estimatedImpact: string;
}

export function generateCoachingReport(clinicianId: string): CoachingReport {
  const perf = computeClinicianPerformance(clinicianId);

  const ruleBasedFlags: string[] = [];
  let priority: CoachingReport["priority"] = "low";

  if (perf.accuracyScore < 0.75) {
    ruleBasedFlags.push("Critical accuracy deficit (<75%) — immediate clinical review protocol required");
    priority = "critical";
  } else if (perf.accuracyScore < 0.80) {
    ruleBasedFlags.push("Diagnostic accuracy below 80% — differential diagnosis review needed for complex cases");
    if (priority === "low") priority = "high";
  } else if (perf.accuracyScore < 0.88) {
    ruleBasedFlags.push("Accuracy below optimal (88%) — improvement opportunities in complex case management");
    if (priority === "low") priority = "medium";
  }

  if (perf.escalationRate > 0.30) {
    ruleBasedFlags.push("Escalation rate exceeds 30% — review early warning sign recognition protocols");
    priority = "critical";
  } else if (perf.escalationRate > 0.20) {
    ruleBasedFlags.push("Escalation rate above 20% — consider earlier triage pattern recognition training");
    if (priority === "low") priority = "high";
  }

  if (perf.avgDecisionTimeMs > 8000) {
    ruleBasedFlags.push("Decision latency critically high (>8s) — workflow and UI navigation review required");
    if (priority === "low") priority = "high";
  } else if (perf.avgDecisionTimeMs > 5000) {
    ruleBasedFlags.push("Decision latency elevated (>5s) — consider clinical decision support shortcuts");
    if (priority === "low") priority = "medium";
  }

  if (perf.denialRate > 0.20) {
    ruleBasedFlags.push("Claim denial rate >20% — CPT selection, coding accuracy, and documentation depth review");
    if (priority !== "critical") priority = "high";
  } else if (perf.denialRate > 0.12) {
    ruleBasedFlags.push("Denial rate above 12% — documentation quality and modifier usage review recommended");
    if (priority === "low") priority = "medium";
  }

  if (perf.loadUtilization > 0.90) {
    ruleBasedFlags.push("Load utilization >90% — redistribution recommended to prevent burnout");
    if (priority === "low") priority = "medium";
  }

  if (ruleBasedFlags.length === 0) {
    ruleBasedFlags.push("All performance metrics within excellent ranges — no critical flags detected");
  }

  const recommendations: string[] = [];

  if (perf.accuracyScore < 0.85) {
    recommendations.push("Schedule monthly case review sessions focusing on the top 5 misdiagnosed conditions");
    recommendations.push("Review AI diagnostic confidence scores before confirming diagnoses in low-confidence cases");
  }

  if (perf.escalationRate > 0.18) {
    recommendations.push("Enroll in advanced triage recognition module to improve early warning identification");
    recommendations.push("Review last 20 escalated cases for pattern identification and prevention opportunities");
  }

  if (perf.avgDecisionTimeMs > 4500) {
    recommendations.push("Use keyboard shortcuts and quick-select lists to reduce time on repetitive data entry");
    recommendations.push("Pre-populate frequent diagnosis/treatment pairs to accelerate decision workflows");
  }

  if (perf.denialRate > 0.10) {
    recommendations.push("Complete CPT coding accuracy training — focus on E&M level documentation requirements");
    recommendations.push("Review denied claims with billing team to identify systematic documentation gaps");
  }

  if (recommendations.length === 0) {
    recommendations.push("Maintain current excellent performance trajectory and consider mentoring junior staff");
    recommendations.push("Explore advanced specialization opportunities to further increase case complexity handling");
  }

  const strengths: string[] = [];
  if (perf.accuracyScore >= 0.90) strengths.push(`Exceptional diagnostic accuracy at ${(perf.accuracyScore * 100).toFixed(1)}%`);
  if (perf.escalationRate < 0.12) strengths.push(`Low escalation rate ${(perf.escalationRate * 100).toFixed(0)}% — strong early intervention skills`);
  if (perf.avgDecisionTimeMs < 3500) strengths.push(`Fast decision speed (${(perf.avgDecisionTimeMs / 1000).toFixed(1)}s avg) — efficient workflow management`);
  if (perf.denialRate < 0.08) strengths.push(`Excellent claim approval rate with only ${(perf.denialRate * 100).toFixed(0)}% denial rate`);
  if (strengths.length === 0) strengths.push("Consistent case completion — reliable baseline performance across all metrics");

  const focusArea = perf.denialRate > 0.15 ? "Billing documentation quality"
    : perf.escalationRate > 0.20 ? "Escalation threshold recognition"
    : perf.accuracyScore < 0.85 ? "Diagnostic accuracy improvement"
    : perf.avgDecisionTimeMs > 5000 ? "Workflow efficiency"
    : "Performance maintenance and mentoring";

  const actionPlan: string[] = [
    `Week 1-2: ${focusArea === "Diagnostic accuracy improvement" ? "Case review of 15 recent misdiagnosed encounters" : focusArea === "Billing documentation quality" ? "Complete CPT coding refresher with billing team" : "Baseline performance audit and goal setting"}`,
    `Month 1: ${recommendations[0] ?? "Monitor key metric trends"}`,
    `Month 2-3: ${recommendations[1] ?? "Reassess and refine improvement plan"}`,
    "Quarterly: Full performance review against benchmarks",
  ];

  const gainPct = perf.denialRate > 0.12 ? Math.round((perf.denialRate - 0.08) * perf.totalCases * 95) : 0;
  const estimatedImpact = gainPct > 0
    ? `Estimated $${gainPct.toLocaleString()} annual revenue recovery if denial rate reduced to 8% benchmark`
    : `Performance already near optimal — focus on maintaining excellence and increasing case volume`;

  return {
    clinicianId,
    priority,
    metrics: {
      accuracyScore: perf.accuracyScore,
      escalationRate: perf.escalationRate,
      avgDecisionTimeMs: perf.avgDecisionTimeMs,
      denialRate: perf.denialRate,
      totalCases: perf.totalCases,
      performanceGrade: perf.performanceGrade,
      tier: perf.tier,
    },
    ruleBasedFlags,
    recommendations,
    strengths,
    focusArea,
    actionPlan,
    estimatedImpact,
  };
}
