import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
  safeString,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

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

const GENERIC_RED_FLAGS: Record<string, string[]> = {
  chest_pain: ["shortness of breath", "sob", "crushing", "radiating", "syncope"],
  abdominal_pain: ["rebound", "rigid", "black stool", "bloody stool", "fainting"],
  sore_throat: ["drooling", "muffled voice", "stridor", "cannot swallow"],
  cough: ["shortness of breath", "hypoxia", "blue lips", "chest pain"],
  fever: ["lethargic", "stiff neck", "confused", "seizure"],
  rash: ["mouth sores", "eye pain", "skin peeling", "purpura"],
  general_symptom: ["shortness of breath", "confused", "unresponsive", "severe pain"],
};

function buildSourceText(context: SkillContext): string {
  return [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
    JSON.stringify(context.knownFacts ?? {}),
    JSON.stringify(context.modifiers ?? {}),
  ]
    .join(" ")
    .toLowerCase();
}

function matchCsvRedFlags(rows: CsvRow[], complaintId: string, source: string): RedFlagHit[] {
  const hits: RedFlagHit[] = [];

  for (const row of rows) {
    const rowComplaint = getFirstValue(row, ["Complaint_ID", "CC_ID", "Complaint"]);
    if (rowComplaint && rowComplaint.toLowerCase() !== complaintId.toLowerCase()) continue;

    const trigger = getFirstValue(row, ["Trigger", "Pattern", "Keyword", "Condition"]);
    const label = getFirstValue(row, ["Label", "Red_Flag", "Flag_Name", "Description"]);
    const severity = getFirstValue(row, ["Severity", "Severity_Level"]) || "high";
    const id = getFirstValue(row, ["Red_Flag_ID", "Rule_ID", "ID"]) || `RF_${label}`;

    if (!trigger) continue;

    const terms = trigger
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const matched = terms.some((term) => source.includes(term));
    if (matched) {
      hits.push({
        id,
        label: label || trigger,
        severity,
      });
    }
  }

  return hits;
}

function matchFallbackRedFlags(complaintId: string, source: string): RedFlagHit[] {
  const terms = GENERIC_RED_FLAGS[complaintId] ?? GENERIC_RED_FLAGS.general_symptom;
  const hits: RedFlagHit[] = [];

  for (const term of terms) {
    if (source.includes(term.toLowerCase())) {
      hits.push({
        id: `RF_${complaintId}_${term.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`,
        label: term,
        severity: "critical",
      });
    }
  }

  return hits;
}

export async function detectRedFlags(
  context: SkillContext
): Promise<SkillResult<DetectRedFlagsResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "detect_red_flags");

  const source = buildSourceText(context);
  let redFlagRows: CsvRow[] = [];

  try {
    redFlagRows = await loadCsvTable("RED_FLAG_RULES.csv");
  } catch {
    try {
      redFlagRows = await loadCsvTable("RED_FLAGS.csv");
    } catch {
      redFlagRows = [];
    }
  }

  const csvHits = redFlagRows.length
    ? matchCsvRedFlags(redFlagRows, context.complaintId!, source)
    : [];

  const fallbackHits = csvHits.length === 0
    ? matchFallbackRedFlags(context.complaintId!, source)
    : [];

  const red_flag_hits = [...csvHits, ...fallbackHits];

  let severity: DetectRedFlagsResult["severity"] = "none";
  if (red_flag_hits.some((h) => h.severity.toLowerCase() === "critical")) severity = "critical";
  else if (red_flag_hits.some((h) => h.severity.toLowerCase() === "high")) severity = "high";
  else if (red_flag_hits.length > 0) severity = "moderate";

  const result: SkillResult<DetectRedFlagsResult> = {
    skillId: "SK005",
    skillName: "detect_red_flags",
    version: "v1",
    status: "success",
    confidence: 0.94,
    result: {
      red_flag_hits,
      severity,
      escalation_needed: severity === "critical" || severity === "high",
      rationale_refs: red_flag_hits.map((h) => h.id),
    },
    audit: {
      tablesUsed: redFlagRows.length ? ["RED_FLAG_RULES"] : ["RED_FLAGS_FALLBACK"],
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
