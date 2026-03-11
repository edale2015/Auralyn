import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { attachCostMetadata } from "../shared/skillCostTracker";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";
import { buildSyntheticAnswers } from "../shared/syntheticAnswerBridge";
import { complaintIdsMatch, canonicalizeComplaintId } from "../shared/complaintAliasRegistry";
import { evaluateWhenExpr } from "../shared/expressionEvaluator";

type DetermineDispositionResult = {
  disposition: string;
  urgency: string;
  care_site: string;
  rationale: string;
};

function getStructuredFacts(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.knownFacts ??
    {}
  );
}

function fallbackDisposition(redFlagSeverity: string, escalationNeeded: boolean): DetermineDispositionResult {
  if (redFlagSeverity === "critical") {
    return {
      disposition: "er_now",
      urgency: "critical",
      care_site: "emergency_department",
      rationale: "Critical red flag(s) detected",
    };
  }

  if (redFlagSeverity === "high" || escalationNeeded) {
    return {
      disposition: "urgent_same_day",
      urgency: "high",
      care_site: "urgent_care",
      rationale: "High-risk feature(s) detected",
    };
  }

  return {
    disposition: "routine_evaluation",
    urgency: "routine",
    care_site: "urgent_care",
    rationale: "No urgent or emergency rule matched",
  };
}

export async function determineDisposition(
  context: SkillContext
): Promise<SkillResult<DetermineDispositionResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "determine_disposition");

  const complaintId = canonicalizeComplaintId(context.complaintId);
  const facts = getStructuredFacts(context);
  const { answers } = buildSyntheticAnswers(complaintId, facts, context.modifiers ?? {});

  const redFlagResult =
    context.priorSkillOutputs?.detect_red_flags?.result ??
    context.priorSkillOutputs?.detectRedFlags?.result ??
    {};

  const redFlagSeverity = redFlagResult.severity ?? "none";
  const escalationNeeded = redFlagResult.escalation_needed === true;

  let gateResult = "PASS";
  if (redFlagSeverity === "critical") gateResult = "ER_SEND";
  else if (redFlagSeverity === "high" || escalationNeeded) gateResult = "ESCALATE";

  (answers as Record<string, string>)["redFlagGate.gateResult"] = gateResult;

  const clinicalScoreResult =
    context.priorSkillOutputs?.apply_clinical_score?.result ?? {};
  const scoreName = (clinicalScoreResult.score_name ?? "").toLowerCase();
  const scoreValue = clinicalScoreResult.score_value;
  if (scoreName && typeof scoreValue === "number") {
    (answers as Record<string, string>)[`scores.${scoreName}`] = String(scoreValue);
  }

  const clusterResults = context.priorSkillOutputs?.score_differential_clusters?.result;
  if (clusterResults?.scored_clusters) {
    for (const cl of clusterResults.scored_clusters) {
      (answers as Record<string, string>)[`scores.${cl.cluster_id}`] = String(cl.score);
    }
  }

  let dispRows: CsvRow[] = [];
  const tablesUsed: string[] = [];
  let finalResult: DetermineDispositionResult | null = null;
  let matchedRuleId = "";

  try {
    dispRows = await loadCsvTable("DISPOSITION_RULES.csv");
  } catch {
    dispRows = [];
  }

  if (dispRows.length) {
    tablesUsed.push("DISPOSITION_RULES");

    for (const row of dispRows) {
      const rowComplaint = getFirstValue(row, ["CC_ID", "Complaint_ID", "Complaint"]);
      if (rowComplaint && !complaintIdsMatch(rowComplaint, complaintId)) continue;

      const expr = getFirstValue(row, ["WHEN_EXPR", "Trigger", "Condition", "Rule_Expr"]);
      const disposition = getFirstValue(row, ["DISPOSITION_LEVEL", "Disposition", "Disposition_Code"]);
      const urgency = getFirstValue(row, ["URGENCY", "Urgency", "Priority"]) || "routine";
      const careSite = getFirstValue(row, ["CARE_SITE", "Care_Site", "Site"]) || "urgent_care";
      const rationale = getFirstValue(row, ["RATIONALE", "Rationale", "Reason"]) || disposition;
      const ruleId = getFirstValue(row, ["RULE_ID", "ID", "Disposition_Rule_ID"]) || disposition;

      if (!expr || !disposition) continue;
      if (!evaluateWhenExpr(expr, answers)) continue;

      finalResult = {
        disposition,
        urgency,
        care_site: careSite,
        rationale,
      };
      matchedRuleId = ruleId;
      break;
    }
  }

  if (!finalResult) {
    tablesUsed.push("DISPOSITION_RULES_FALLBACK");
    finalResult = fallbackDisposition(redFlagSeverity, escalationNeeded);
  }

  const reasoning_summary = matchedRuleId
    ? `Disposition [${finalResult.disposition}] matched rule ${matchedRuleId} — gate: ${gateResult}, rationale: ${finalResult.rationale}.`
    : `No CSV rule matched — fallback disposition [${finalResult.disposition}] from red flag severity [${redFlagSeverity}].`;

  let result: SkillResult<DetermineDispositionResult> = {
    skillId: "SK006",
    skillName: "determine_disposition",
    version: "v1",
    status: "success",
    confidence: matchedRuleId ? 0.97 : 0.93,
    reasoning_summary,
    result: finalResult,
    audit: {
      tablesUsed,
      ruleHits: matchedRuleId ? [matchedRuleId] : [],
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills:
      finalResult.disposition === "er_now"
        ? ["generate_emergency_warning", "generate_physician_review_packet"]
        : ["generate_assessment_plan", "generate_physician_review_packet"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: complaintId,
  });

  assertSkillResultShape(result, "determine_disposition");
  return result;
}
