import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

type DetermineDispositionResult = {
  disposition: string;
  urgency: string;
  care_site: string;
  rationale: string;
};

function matchDispositionFromRules(
  rows: CsvRow[],
  complaintId: string,
  redFlagIds: string[]
): DetermineDispositionResult | null {
  for (const row of rows) {
    const rowComplaint = getFirstValue(row, ["Complaint_ID", "CC_ID", "Complaint"]);
    if (rowComplaint && rowComplaint.toLowerCase() !== complaintId.toLowerCase()) continue;

    const trigger = getFirstValue(row, ["Trigger", "Rule_Trigger", "Condition"]);
    const disposition = getFirstValue(row, ["Disposition", "Disposition_Code"]);
    const urgency = getFirstValue(row, ["Urgency", "Priority"]) || "routine";
    const careSite = getFirstValue(row, ["Care_Site", "Site"]) || "urgent_care";
    const rationale = getFirstValue(row, ["Rationale", "Reason", "Explanation"]) || disposition;

    if (!trigger || !disposition) continue;

    const triggerTerms = trigger
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    const matched = triggerTerms.some((t) => redFlagIds.includes(t));
    if (matched) {
      return {
        disposition,
        urgency,
        care_site: careSite,
        rationale,
      };
    }
  }

  return null;
}

export async function determineDisposition(
  context: SkillContext
): Promise<SkillResult<DetermineDispositionResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "determine_disposition");

  const redFlagResult =
    context.priorSkillOutputs?.detect_red_flags?.result ??
    context.priorSkillOutputs?.detectRedFlags?.result ??
    {};

  const redFlagIds: string[] = Array.isArray(redFlagResult.rationale_refs)
    ? redFlagResult.rationale_refs
    : [];

  const redFlagSeverity = redFlagResult.severity ?? "none";
  const escalationNeeded = redFlagResult.escalation_needed === true;

  let dispRows: CsvRow[] = [];
  try {
    dispRows = await loadCsvTable("DISPOSITION_RULES.csv");
  } catch {
    try {
      dispRows = await loadCsvTable("DISP_RULES.csv");
    } catch {
      dispRows = [];
    }
  }

  let finalResult =
    dispRows.length > 0
      ? matchDispositionFromRules(dispRows, context.complaintId!, redFlagIds)
      : null;

  if (!finalResult) {
    if (redFlagSeverity === "critical") {
      finalResult = {
        disposition: "er_now",
        urgency: "critical",
        care_site: "emergency_department",
        rationale: "Critical red flag(s) detected",
      };
    } else if (escalationNeeded || redFlagSeverity === "high") {
      finalResult = {
        disposition: "urgent_same_day",
        urgency: "high",
        care_site: "urgent_care",
        rationale: "High-risk feature(s) detected",
      };
    } else {
      finalResult = {
        disposition: "routine_evaluation",
        urgency: "routine",
        care_site: "urgent_care",
        rationale: "No red flags requiring escalation detected",
      };
    }
  }

  const result: SkillResult<DetermineDispositionResult> = {
    skillId: "SK006",
    skillName: "determine_disposition",
    version: "v1",
    status: "success",
    confidence: 0.96,
    result: finalResult,
    audit: {
      tablesUsed: dispRows.length ? ["DISPOSITION_RULES"] : ["DISP_RULES_FALLBACK"],
      ruleHits: redFlagIds,
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills:
      finalResult.disposition === "er_now"
        ? ["generate_emergency_warning", "generate_physician_review_packet"]
        : ["generate_assessment_plan", "generate_physician_review_packet"],
  };

  assertSkillResultShape(result, "determine_disposition");
  return result;
}
