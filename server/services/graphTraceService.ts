import { SkillContext } from "../skills/shared/skillTypes";

export function buildGraphTrace(context: SkillContext) {
  const outputs = context.priorSkillOutputs ?? {};

  const steps = Object.entries(outputs).map(([skillName, result]: any, idx) => ({
    step: idx + 1,
    node: skillName,
    status: result?.status ?? "unknown",
    confidence: result?.confidence ?? null,
    reasoning_summary: result?.reasoning_summary ?? "",
    ruleHits: result?.audit?.ruleHits ?? [],
    missingData: result?.audit?.missingData ?? [],
    estimatedCostUsd: result?.audit?.estimatedCostUsd ?? 0,
    latencyMs: result?.audit?.latencyMs ?? 0,
    nextRecommendedSkills: result?.nextRecommendedSkills ?? [],
  }));

  const totalEstimatedCostUsd = steps.reduce(
    (sum, s) => sum + Number(s.estimatedCostUsd ?? 0),
    0
  );
  const totalLatencyMs = steps.reduce(
    (sum, s) => sum + Number(s.latencyMs ?? 0),
    0
  );

  const stopReason = outputs?.determine_disposition?.result?.disposition
    ? `Disposition reached: ${outputs.determine_disposition.result.disposition}`
    : steps.length
    ? "No further graph edges or sequence complete"
    : "No graph steps executed";

  return { steps, totals: { totalEstimatedCostUsd, totalLatencyMs }, stopReason };
}
