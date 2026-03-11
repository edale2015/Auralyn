import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { attachCostMetadata } from "../shared/skillCostTracker";
import { CsvRow, getFirstValue, loadCsvTable, toNumber } from "../shared/csvTableLoader";
import { buildSyntheticAnswers } from "../shared/syntheticAnswerBridge";
import { complaintIdsMatch, canonicalizeComplaintId } from "../shared/complaintAliasRegistry";
import { evaluateWhenExpr } from "../shared/expressionEvaluator";

type ScoredCluster = {
  cluster_id: string;
  cluster_name: string;
  score: number;
  supporting_hits: string[];
};

type ScoreDifferentialClustersResult = {
  scored_clusters: ScoredCluster[];
  trigger_hits: string[];
  missing_discriminators: string[];
};

function getFacts(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.knownFacts ??
    {}
  );
}

export async function scoreDifferentialClusters(
  context: SkillContext
): Promise<SkillResult<ScoreDifferentialClustersResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "score_differential_clusters");

  const complaintId = canonicalizeComplaintId(context.complaintId);
  const facts = getFacts(context);
  const { answers } = buildSyntheticAnswers(complaintId, facts, context.modifiers ?? {});

  let rows: CsvRow[] = [];
  try {
    rows = await loadCsvTable("CLUSTER_SCORING_RULES.csv");
  } catch {
    rows = [];
  }

  const clusterMap = new Map<string, ScoredCluster>();

  for (const row of rows) {
    const rowComplaint = getFirstValue(row, ["CC_ID", "Complaint_ID", "Complaint"]);
    if (rowComplaint && !complaintIdsMatch(rowComplaint, complaintId)) continue;

    const expr = getFirstValue(row, ["WHEN_EXPR", "Trigger", "Condition"]);
    const cluster_id = getFirstValue(row, ["BEST_CLUSTER_ID", "Cluster_ID", "Diagnosis_Cluster_ID"]);
    const cluster_name =
      getFirstValue(row, ["CLUSTER_NAME", "Cluster_Name", "Diagnosis_Cluster"]) || cluster_id;
    const weight = toNumber(getFirstValue(row, ["WEIGHT", "Weight", "Score"]), 1);

    if (!expr || !cluster_id) continue;
    if (!evaluateWhenExpr(expr, answers)) continue;

    const current =
      clusterMap.get(cluster_id) ?? {
        cluster_id,
        cluster_name,
        score: 0,
        supporting_hits: [],
      };

    current.score += weight;
    current.supporting_hits.push(expr);
    clusterMap.set(cluster_id, current);
  }

  const scored_clusters = [...clusterMap.values()].sort((a, b) => b.score - a.score);
  const trigger_hits = scored_clusters.flatMap((c) => c.supporting_hits);
  const missing_discriminators = scored_clusters.length ? [] : ["no_cluster_rules_matched"];

  const topCluster = scored_clusters[0];
  const reasoning_summary = scored_clusters.length
    ? `Scored ${scored_clusters.length} cluster(s) for ${complaintId}. Top: [${topCluster.cluster_name}] score=${topCluster.score.toFixed(1)}, hits=${topCluster.supporting_hits.length}.`
    : `No cluster rules matched for ${complaintId} — returning partial result.`;

  let result: SkillResult<ScoreDifferentialClustersResult> = {
    skillId: "SK012",
    skillName: "score_differential_clusters",
    version: "v1",
    status: scored_clusters.length ? "success" : "partial",
    confidence: scored_clusters.length ? 0.91 : 0.45,
    reasoning_summary,
    result: {
      scored_clusters,
      trigger_hits,
      missing_discriminators,
    },
    audit: {
      tablesUsed: ["CLUSTER_SCORING_RULES", "SYNTHETIC_ANSWERS", "EXPRESSION_EVALUATOR"],
      ruleHits: trigger_hits,
      missingData: missing_discriminators,
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["apply_clinical_score", "generate_differential"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: complaintId,
  });

  assertSkillResultShape(result, "score_differential_clusters");
  return result;
}
