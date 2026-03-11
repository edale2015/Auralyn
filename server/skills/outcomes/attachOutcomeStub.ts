import { OutcomeStub, SkillContext, SkillResult } from "../shared/skillTypes";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";

function inferFollowUpWindowDays(complaintId?: string, disposition?: string): number {
  if (disposition === "er_now") return 1;
  if (disposition === "urgent_same_day") return 2;

  switch (complaintId) {
    case "chest_pain":
    case "abdominal_pain":
      return 2;
    case "uti":
    case "fever":
    case "cough":
      return 3;
    default:
      return 5;
  }
}

export async function attachOutcomeStub(
  context: SkillContext
): Promise<SkillResult<OutcomeStub>> {
  const started = Date.now();

  const priorDisposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ??
    context.priorSkillOutputs?.determineDisposition?.result?.disposition ??
    "unknown";

  const stub: OutcomeStub = {
    outcomeTrackingId: `OUTCOME_${context.caseId}`,
    caseId: context.caseId,
    complaintId: context.complaintId,
    expectedFollowUpWindowDays: inferFollowUpWindowDays(context.complaintId, priorDisposition),
    callbackNeeded: priorDisposition === "urgent_same_day" || priorDisposition === "er_now",
    outcomeStatus: "pending",
    linkedDisposition: priorDisposition,
    createdAt: new Date().toISOString(),
  };

  let result: SkillResult<OutcomeStub> = {
    skillId: "SK016",
    skillName: "attach_outcome_stub",
    version: "v1",
    status: "success",
    confidence: 0.98,
    reasoning_summary: buildReasoningSummary({
      skillName: "attach_outcome_stub",
      headline: `Outcome stub created. Disposition: [${priorDisposition}]. Callback needed: ${stub.callbackNeeded}. Follow-up window: ${stub.expectedFollowUpWindowDays}d.`,
      matchedRules: ["OUTCOME_STUB_CREATED"],
      missingData: priorDisposition === "unknown" ? ["final_disposition"] : [],
      confidence: 0.98,
    }),
    result: stub,
    audit: {
      tablesUsed: ["OUTCOME_TRACKING"],
      ruleHits: ["OUTCOME_STUB_CREATED"],
      missingData: priorDisposition === "unknown" ? ["final_disposition"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["measure_workflow_value"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: context.complaintId,
  });

  return result;
}
