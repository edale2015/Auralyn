import * as fs from "fs/promises";
import * as path from "path";
import { SkillResult } from "../shared/skillTypes";

type RecordCaseOutcomeInput = {
  caseId: string;
  finalDiagnosis?: string;
  medicationsPrescribed?: string[];
  testsPerformed?: string[];
  hospitalTransfer?: boolean;
  returnVisit72h?: boolean;
  returnVisit7d?: boolean;
  clinicianNotes?: string;
};

type RecordCaseOutcomeResult = {
  outcome_record_id: string;
  case_id: string;
  outcome_saved: boolean;
};

const OUTCOME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(OUTCOME_DIR, { recursive: true });
}

export async function recordCaseOutcome(
  input: RecordCaseOutcomeInput
): Promise<SkillResult<RecordCaseOutcomeResult>> {
  const started = Date.now();
  await ensureDir();

  const record = {
    outcome_record_id: `OUTCOME_REC_${input.caseId}_${Date.now()}`,
    case_id: input.caseId,
    finalDiagnosis: input.finalDiagnosis ?? "",
    medicationsPrescribed: input.medicationsPrescribed ?? [],
    testsPerformed: input.testsPerformed ?? [],
    hospitalTransfer: input.hospitalTransfer ?? false,
    returnVisit72h: input.returnVisit72h ?? false,
    returnVisit7d: input.returnVisit7d ?? false,
    clinicianNotes: input.clinicianNotes ?? "",
    recordedAt: new Date().toISOString(),
  };

  await fs.appendFile(
    path.join(OUTCOME_DIR, "case_outcomes.ndjson"),
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return {
    skillId: "OUTCOME_RECORD_CASE",
    skillName: "record_case_outcome",
    version: "v1",
    status: "success",
    confidence: 0.99,
    result: {
      outcome_record_id: record.outcome_record_id,
      case_id: input.caseId,
      outcome_saved: true,
    },
    audit: {
      tablesUsed: ["CASE_OUTCOMES_RUNTIME"],
      ruleHits: ["OUTCOME_RECORDED"],
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["link_follow_up_result", "reconcile_predicted_vs_actual"],
  };
}
