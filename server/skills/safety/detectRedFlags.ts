import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";
import { phrasePresent } from "../shared/negationHelper";

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

const FALLBACK_FLAGS: Record<string, Array<{ phrase: string; label: string }>> = {
  sore_throat: [
    { phrase: "drooling", label: "drooling" },
    { phrase: "stridor", label: "stridor" },
    { phrase: "muffled voice", label: "muffled voice" },
    { phrase: "cannot swallow", label: "cannot swallow" },
  ],
  ent_sore_throat: [
    { phrase: "drooling", label: "drooling" },
    { phrase: "stridor", label: "stridor" },
    { phrase: "muffled voice", label: "muffled voice" },
    { phrase: "cannot swallow", label: "cannot swallow" },
  ],
  cough: [
    { phrase: "shortness of breath", label: "shortness of breath" },
    { phrase: "chest pain", label: "chest pain" },
    { phrase: "confused", label: "confused" },
  ],
  chest_pain: [
    { phrase: "shortness of breath", label: "shortness of breath" },
    { phrase: "syncope", label: "syncope" },
  ],
};

function getStructuredFacts(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.knownFacts ??
    {}
  );
}

export async function detectRedFlags(
  context: SkillContext
): Promise<SkillResult<DetectRedFlagsResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "detect_red_flags");

  const facts = getStructuredFacts(context);
  const source = [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ].join(" ");

  const hits: RedFlagHit[] = [];

  let ruleRows: CsvRow[] = [];
  try {
    ruleRows = await loadCsvTable("RED_FLAG_RULES.csv");
  } catch {
    ruleRows = [];
  }

  if (!ruleRows.length) {
    const complaintId = context.complaintId ?? "";
    const fallback = FALLBACK_FLAGS[complaintId] ?? [];
    for (const item of fallback) {
      if (phrasePresent(source, item.phrase)) {
        hits.push({
          id: `RF_${complaintId}_${item.label.replace(/\s+/g, "_").toUpperCase()}`,
          label: item.label,
          severity: "critical",
        });
      }
    }
  }

  if (facts.drooling_present) {
    hits.push({ id: "RF_DROOLING", label: "drooling", severity: "critical" });
  }
  if (facts.stridor_present) {
    hits.push({ id: "RF_STRIDOR", label: "stridor", severity: "critical" });
  }
  if (facts.muffled_voice_present) {
    hits.push({ id: "RF_MUFFLED_VOICE", label: "muffled voice", severity: "high" });
  }
  if (facts.cannot_swallow_present) {
    hits.push({ id: "RF_CANNOT_SWALLOW", label: "cannot swallow", severity: "critical" });
  }
  if (facts.sob_present) {
    hits.push({ id: "RF_SOB", label: "shortness of breath", severity: "high" });
  }
  if (facts.confusion_present) {
    hits.push({ id: "RF_CONFUSION", label: "confusion", severity: "high" });
  }

  const unique = new Map<string, RedFlagHit>();
  for (const hit of hits) unique.set(hit.id, hit);
  const red_flag_hits = [...unique.values()];

  let severity: DetectRedFlagsResult["severity"] = "none";
  if (red_flag_hits.some((h) => h.severity.toLowerCase() === "critical")) severity = "critical";
  else if (red_flag_hits.some((h) => h.severity.toLowerCase() === "high")) severity = "high";
  else if (red_flag_hits.length) severity = "moderate";

  const result: SkillResult<DetectRedFlagsResult> = {
    skillId: "SK005",
    skillName: "detect_red_flags",
    version: "v1",
    status: "success",
    confidence: 0.95,
    result: {
      red_flag_hits,
      severity,
      escalation_needed: severity === "critical" || severity === "high",
      rationale_refs: red_flag_hits.map((h) => h.id),
    },
    audit: {
      tablesUsed: ruleRows.length
        ? ["RED_FLAG_RULES", "NEGATION_HELPER", "NORMALIZED_FACTS"]
        : ["RED_FLAG_RULES_FALLBACK", "NEGATION_HELPER", "NORMALIZED_FACTS"],
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
