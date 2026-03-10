import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";
import { phrasePresent } from "../shared/negationHelper";
import { buildSyntheticAnswers } from "../shared/syntheticAnswerBridge";
import { complaintIdsMatch, canonicalizeComplaintId } from "../shared/complaintAliasRegistry";
import { evaluateWhenExpr } from "../shared/expressionEvaluator";

type RedFlagHit = {
  id: string;
  label: string;
  severity: string;
};

type DetectRedFlagsResult = {
  red_flag_hits: RedFlagHit[];
  severity: "none" | "moderate" | "high" | "critical";
  escalation_needed: boolean;
  rationale_refs: string[];
};

const FALLBACK_FLAGS: Record<string, Array<{ phrase: string; label: string; severity: string }>> = {
  sore_throat: [
    { phrase: "drooling", label: "drooling", severity: "critical" },
    { phrase: "stridor", label: "stridor", severity: "critical" },
    { phrase: "muffled voice", label: "muffled voice", severity: "high" },
    { phrase: "cannot swallow", label: "cannot swallow", severity: "critical" },
  ],
  cough: [
    { phrase: "shortness of breath", label: "shortness of breath", severity: "high" },
    { phrase: "chest pain", label: "chest pain", severity: "high" },
    { phrase: "confused", label: "confusion", severity: "high" },
  ],
};

function getStructuredFacts(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.knownFacts ??
    {}
  );
}

function severityRank(severity: string): number {
  switch (severity.toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

export async function detectRedFlags(
  context: SkillContext
): Promise<SkillResult<DetectRedFlagsResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "detect_red_flags");

  const complaintId = canonicalizeComplaintId(context.complaintId);
  const facts = getStructuredFacts(context);
  const source = [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ].join(" ");

  const { answers } = buildSyntheticAnswers(complaintId, facts, context.modifiers ?? {});
  const hits: RedFlagHit[] = [];
  let usedTables: string[] = [];

  let ruleRows: CsvRow[] = [];
  try {
    ruleRows = await loadCsvTable("RED_FLAG_RULES.csv");
  } catch {
    ruleRows = [];
  }

  if (ruleRows.length) {
    usedTables.push("RED_FLAG_RULES");

    for (const row of ruleRows) {
      const rowComplaint = getFirstValue(row, ["CC_ID", "Complaint_ID", "Complaint"]);
      if (rowComplaint && !complaintIdsMatch(rowComplaint, complaintId)) continue;

      const expr = getFirstValue(row, ["TRIGGER_EXPR", "WHEN_EXPR", "Trigger", "Condition"]);
      const id =
        getFirstValue(row, ["RF_ID", "Red_Flag_ID", "Rule_ID", "ID"]) || "RF_UNKNOWN";
      const label =
        getFirstValue(row, ["LABEL", "Red_Flag", "Flag_Name", "Description"]) || id;
      const severity =
        getFirstValue(row, ["SEVERITY", "Severity", "Severity_Level"]) || "high";

      if (!expr) continue;
      if (!evaluateWhenExpr(expr, answers)) continue;

      hits.push({
        id,
        label,
        severity,
      });
    }
  }

  if (!hits.length) {
    usedTables.push("RED_FLAG_RULES_FALLBACK");
    const fallback = FALLBACK_FLAGS[complaintId] ?? [];

    for (const item of fallback) {
      if (phrasePresent(source, item.phrase)) {
        hits.push({
          id: `RF_${complaintId}_${item.label.replace(/\s+/g, "_").toUpperCase()}`,
          label: item.label,
          severity: item.severity,
        });
      }
    }
  }

  const deduped = new Map<string, RedFlagHit>();
  for (const hit of hits) {
    const existing = deduped.get(hit.id);
    if (!existing || severityRank(hit.severity) > severityRank(existing.severity)) {
      deduped.set(hit.id, hit);
    }
  }

  const red_flag_hits = [...deduped.values()];

  let severity: DetectRedFlagsResult["severity"] = "none";
  if (red_flag_hits.some((h) => h.severity.toLowerCase() === "critical")) severity = "critical";
  else if (red_flag_hits.some((h) => h.severity.toLowerCase() === "high")) severity = "high";
  else if (red_flag_hits.length) severity = "moderate";

  const result: SkillResult<DetectRedFlagsResult> = {
    skillId: "SK005",
    skillName: "detect_red_flags",
    version: "v1",
    status: "success",
    confidence: 0.96,
    result: {
      red_flag_hits,
      severity,
      escalation_needed: severity === "critical" || severity === "high",
      rationale_refs: red_flag_hits.map((h) => h.id),
    },
    audit: {
      tablesUsed: usedTables.length ? usedTables : ["RED_FLAG_RULES_FALLBACK"],
      ruleHits: red_flag_hits.map((h) => h.id),
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills:
      severity === "critical" || severity === "high"
        ? ["determine_disposition", "generate_emergency_warning"]
        : ["run_complaint_question_bundle"],
  };

  assertSkillResultShape(result, "detect_red_flags");
  return result;
}
