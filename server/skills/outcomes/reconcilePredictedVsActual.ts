import * as fs from "fs/promises";
import * as path from "path";
import { SkillContext, SkillResult } from "../shared/skillTypes";

type ReconcilePredictedVsActualInput = {
  context: SkillContext;
  actualFinalDiagnosis?: string;
  actualDisposition?: string;
  returnVisit72h?: boolean;
  admittedAfter?: boolean;
};

type ReconcilePredictedVsActualResult = {
  case_id: string;
  top_prediction_match: boolean;
  disposition_match: boolean;
  safety_miss_flag: boolean;
  reconciliation_saved: boolean;
};

const OUTCOME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(OUTCOME_DIR, { recursive: true });
}

export async function reconcilePredictedVsActual(
  input: ReconcilePredictedVsActualInput
): Promise<SkillResult<ReconcilePredictedVsActualResult>> {
  const started = Date.now();
  await ensureDir();

  const differential =
    input.context.priorSkillOutputs?.generate_differential?.result?.differential_list ?? [];

  const predictedTop = differential[0]?.diagnosis ?? "";
  const predictedDisposition =
    input.context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "";

  const top_prediction_match =
    !!input.actualFinalDiagnosis &&
    predictedTop.toLowerCase().includes(input.actualFinalDiagnosis.toLowerCase());

  const disposition_match =
    !!input.actualDisposition &&
    predictedDisposition.toLowerCase() === input.actualDisposition.toLowerCase();

  const safety_miss_flag =
    Boolean(input.admittedAfter) ||
    Boolean(input.returnVisit72h && predictedDisposition === "routine_evaluation");

  const record = {
    reconciliation_id: `RECON_${input.context.caseId}_${Date.now()}`,
    case_id: input.context.caseId,
    predictedTop,
    actualFinalDiagnosis: input.actualFinalDiagnosis ?? "",
    predictedDisposition,
    actualDisposition: input.actualDisposition ?? "",
    top_prediction_match,
    disposition_match,
    safety_miss_flag,
    returnVisit72h: input.returnVisit72h ?? false,
    admittedAfter: input.admittedAfter ?? false,
    recordedAt: new Date().toISOString(),
  };

  await fs.appendFile(
    path.join(OUTCOME_DIR, "case_reconciliation.ndjson"),
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return {
    skillId: "OUTCOME_RECONCILE_PREDICTED_ACTUAL",
    skillName: "reconcile_predicted_vs_actual",
    version: "v1",
    status: "success",
    confidence: 0.97,
    result: {
      case_id: input.context.caseId,
      top_prediction_match,
      disposition_match,
      safety_miss_flag,
      reconciliation_saved: true,
    },
    audit: {
      tablesUsed: ["CASE_RECONCILIATION_RUNTIME"],
      ruleHits: [
        top_prediction_match ? "TOP_PREDICTION_MATCH" : "",
        disposition_match ? "DISPOSITION_MATCH" : "",
        safety_miss_flag ? "SAFETY_MISS_FLAG" : "",
      ].filter(Boolean),
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: [],
  };
}
