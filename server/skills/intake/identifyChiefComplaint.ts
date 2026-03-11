import { SkillContext, SkillResult } from "../shared/skillTypes";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
  safeString,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";
import { phrasePresent, phraseNegated } from "../shared/negationHelper";

type IdentifyChiefComplaintResult = {
  complaint_id: string;
  alternate_complaints: string[];
  ambiguity_score: number;
};

function complaintIdFromRow(row: CsvRow): string {
  return (
    getFirstValue(row, ["Complaint_ID", "CC_ID", "Chief_Complaint_ID", "ComplaintId"]) ||
    getFirstValue(row, ["LABEL", "Chief_Complaint", "Complaint_Name", "Complaint"])
      .toLowerCase()
      .replace(/\s+/g, "_")
  );
}

function aliasesFromRow(row: CsvRow): string[] {
  const label = getFirstValue(row, [
    "Chief_Complaint",
    "Complaint_Name",
    "Complaint",
    "Display_Name",
    "LABEL",
    "Label",
  ]);
  const aliases = getFirstValue(row, ["ALIASES", "Keywords", "Synonyms", "Search_Terms"]);
  const complaintId = complaintIdFromRow(row);

  return [
    label,
    complaintId.replace(/_/g, " "),
    ...aliases.split(/[|;]+/),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function scoreComplaint(text: string, row: CsvRow): number {
  const aliases = aliasesFromRow(row);
  let score = 0;

  for (const alias of aliases) {
    if (phrasePresent(text, alias)) score += 6;
    else if (phraseNegated(text, alias)) score -= 5;
  }

  return score;
}

export async function identifyChiefComplaint(
  context: SkillContext
): Promise<SkillResult<IdentifyChiefComplaintResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const complaintRegistry = await loadCsvTable("COMPLAINT_REGISTRY.csv");
  const raw = safeString(context.rawText);
  const transcriptText = (context.transcript ?? []).map((t) => t.text).join(" ");
  const source = `${raw} ${transcriptText}`.trim();

  const scored = complaintRegistry
    .map((row) => ({
      row,
      complaintId: complaintIdFromRow(row),
      score: scoreComplaint(source, row),
    }))
    .filter((x) => x.complaintId);

  scored.sort((a, b) => b.score - a.score);

  const positive = scored.filter((s) => s.score > 0);
  const top = positive[0] ?? scored[0];
  const alternates = positive.slice(1, 4).map((x) => x.complaintId);

  const complaint_id = top?.complaintId || "general_symptom";
  const ambiguity_score =
    positive.length >= 2
      ? Math.max(0, Math.min(1, 1 - (positive[0].score - positive[1].score) / Math.max(positive[0].score, 1)))
      : 0.15;

  const confidence = top?.score ? Math.min(0.98, 0.55 + top.score / 20) : 0.45;
  const ruleHits = top
    ? [`CC_MATCH_${complaint_id.toUpperCase()}`]
    : ["CC_FALLBACK_GENERAL"];

  let result: SkillResult<IdentifyChiefComplaintResult> = {
    skillId: "SK003",
    skillName: "identify_chief_complaint",
    version: "v1",
    status: "success",
    confidence,
    reasoning_summary: buildReasoningSummary({
      skillName: "identify_chief_complaint",
      headline: `Chief complaint identified as [${complaint_id}]${alternates.length ? `. Alternates: ${alternates.slice(0, 2).join(", ")}` : ""}. Ambiguity score ${ambiguity_score.toFixed(2)}.`,
      matchedRules: ruleHits,
      missingData: complaint_id === "general_symptom" ? ["specific_complaint_match"] : [],
      confidence,
    }),
    result: { complaint_id, alternate_complaints: alternates, ambiguity_score },
    audit: {
      tablesUsed: ["COMPLAINT_REGISTRY", "NEGATION_HELPER"],
      ruleHits,
      missingData: complaint_id === "general_symptom" ? ["specific_complaint_match"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["normalize_patient_story", "detect_red_flags"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: complaint_id,
  });

  assertSkillResultShape(result, "identify_chief_complaint");
  return result;
}
