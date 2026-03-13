import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export type ExplainabilityScore = {
  caseId: string;
  score: number;
  level: "high" | "medium" | "low";
  factors: Array<{ name: string; value: number; contribution: number }>;
  computedAt: string;
};

export async function computeExplainabilityScore(
  caseId: string
): Promise<ExplainabilityScore> {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");
  const graphTraces = await loadNdjson("graph_trace_log.ndjson");

  const caseRuns = skillRuns.filter((r) => r.caseId === caseId);
  const caseTraces = graphTraces.filter((r) => r.caseId === caseId);

  const skillCount = caseRuns.length;
  const graphPathLength = caseTraces.length;

  const avgConfidence =
    caseRuns.length > 0
      ? caseRuns.reduce((sum, r) => sum + Number(r.confidence ?? 0), 0) /
        caseRuns.length
      : 0;

  const reasoningSummaryCount = caseRuns.filter(
    (r) => r.reasoningSummary && r.reasoningSummary.length > 10
  ).length;

  const reasoningCoverage =
    skillCount > 0 ? reasoningSummaryCount / skillCount : 0;

  const factors = [
    {
      name: "avg_confidence",
      value: avgConfidence,
      contribution: avgConfidence * 40,
    },
    {
      name: "reasoning_coverage",
      value: reasoningCoverage,
      contribution: reasoningCoverage * 30,
    },
    {
      name: "skill_depth",
      value: skillCount,
      contribution: Math.min(skillCount / 10, 1) * 20,
    },
    {
      name: "graph_path_length",
      value: graphPathLength,
      contribution: graphPathLength > 0 ? 10 : 0,
    },
  ];

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.contribution, 0)
  );

  const level: ExplainabilityScore["level"] =
    score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return {
    caseId,
    score,
    level,
    factors,
    computedAt: new Date().toISOString(),
  };
}

export async function batchExplainabilityScores(limit = 50): Promise<ExplainabilityScore[]> {
  const skillRuns = await loadNdjson("skill_run_log.ndjson");

  const uniqueCaseIds = [
    ...new Set(skillRuns.map((r) => r.caseId).filter(Boolean)),
  ].slice(-limit);

  const scores: ExplainabilityScore[] = [];
  for (const caseId of uniqueCaseIds) {
    try {
      scores.push(await computeExplainabilityScore(caseId));
    } catch {
      // skip
    }
  }

  return scores.sort((a, b) => a.score - b.score);
}
