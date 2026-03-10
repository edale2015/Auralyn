import * as fs from "fs/promises";
import * as path from "path";
import { SkillResult } from "../shared/skillTypes";

type LinkFollowUpResultInput = {
  caseId: string;
  callbackCompleted?: boolean;
  patientImproved?: boolean;
  patientWorsened?: boolean;
  emergencyVisitAfter?: boolean;
  admittedAfter?: boolean;
  followUpNotes?: string;
};

type LinkFollowUpResultOutput = {
  follow_up_record_id: string;
  case_id: string;
  follow_up_saved: boolean;
};

const OUTCOME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(OUTCOME_DIR, { recursive: true });
}

export async function linkFollowUpResult(
  input: LinkFollowUpResultInput
): Promise<SkillResult<LinkFollowUpResultOutput>> {
  const started = Date.now();
  await ensureDir();

  const record = {
    follow_up_record_id: `FOLLOWUP_${input.caseId}_${Date.now()}`,
    case_id: input.caseId,
    callbackCompleted: input.callbackCompleted ?? false,
    patientImproved: input.patientImproved ?? false,
    patientWorsened: input.patientWorsened ?? false,
    emergencyVisitAfter: input.emergencyVisitAfter ?? false,
    admittedAfter: input.admittedAfter ?? false,
    followUpNotes: input.followUpNotes ?? "",
    recordedAt: new Date().toISOString(),
  };

  await fs.appendFile(
    path.join(OUTCOME_DIR, "case_followups.ndjson"),
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return {
    skillId: "OUTCOME_LINK_FOLLOWUP",
    skillName: "link_follow_up_result",
    version: "v1",
    status: "success",
    confidence: 0.99,
    result: {
      follow_up_record_id: record.follow_up_record_id,
      case_id: input.caseId,
      follow_up_saved: true,
    },
    audit: {
      tablesUsed: ["CASE_FOLLOWUPS_RUNTIME"],
      ruleHits: ["FOLLOWUP_LINKED"],
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["reconcile_predicted_vs_actual"],
  };
}
