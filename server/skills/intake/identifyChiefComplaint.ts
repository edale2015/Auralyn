import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
  safeString,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

type IdentifyChiefComplaintResult = {
  complaint_id: string;
  alternate_complaints: string[];
  ambiguity_score: number;
};

function complaintIdFromRow(row: CsvRow): string {
  return (
    getFirstValue(row, ["Complaint_ID", "CC_ID", "Chief_Complaint_ID", "ComplaintId"]) ||
    getFirstValue(row, ["Chief_Complaint", "Complaint_Name", "Complaint"])
      .toLowerCase()
      .replace(/\s+/g, "_")
  );
}

function complaintLabelFromRow(row: CsvRow): string {
  return getFirstValue(row, [
    "Chief_Complaint",
    "Complaint_Name",
    "Complaint",
    "Display_Name",
    "LABEL",
    "Label",
  ]);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreComplaint(text: string, row: CsvRow): number {
  const label = complaintLabelFromRow(row).toLowerCase();
  const complaintId = complaintIdFromRow(row).toLowerCase();
  const hay = text.toLowerCase();
  let score = 0;

  if (label && hay.includes(label)) score += 10;
  if (complaintId && hay.includes(complaintId.replace(/_/g, " "))) score += 8;

  for (const token of tokenize(label)) {
    if (hay.includes(token)) score += 2;
  }
  for (const token of tokenize(complaintId)) {
    if (hay.includes(token)) score += 2;
  }

  const keywords = getFirstValue(row, ["Keywords", "Synonyms", "Search_Terms", "ALIASES", "Aliases"]);
  for (const keyword of keywords.split(/[|;]/).map((s) => s.trim()).filter(Boolean)) {
    if (hay.includes(keyword.toLowerCase())) score += 3;
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

  const top = scored[0];
  const alternates = scored.slice(1, 4).filter((x) => x.score > 0).map((x) => x.complaintId);

  const complaint_id = top?.complaintId || "general_symptom";
  const ambiguity_score =
    top && scored[1]
      ? Math.max(0, Math.min(1, 1 - (top.score - scored[1].score) / Math.max(top.score, 1)))
      : 0.1;

  const result: SkillResult<IdentifyChiefComplaintResult> = {
    skillId: "SK003",
    skillName: "identify_chief_complaint",
    version: "v1",
    status: "success",
    confidence: top?.score ? Math.min(0.98, 0.55 + top.score / 20) : 0.45,
    result: {
      complaint_id,
      alternate_complaints: alternates,
      ambiguity_score,
    },
    audit: {
      tablesUsed: ["COMPLAINT_REGISTRY"],
      ruleHits: top ? [`CC_MATCH_${complaint_id.toUpperCase()}`] : ["CC_FALLBACK_GENERAL"],
      missingData: complaint_id === "general_symptom" ? ["specific_complaint_match"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["normalize_patient_story", "detect_red_flags"],
  };

  assertSkillResultShape(result, "identify_chief_complaint");
  return result;
}
