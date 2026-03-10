import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
  safeString,
} from "../shared/schemaValidators";

type CollectModifiersResult = {
  modifiers: Record<string, any>;
  missing_fields: string[];
  risk_tags: string[];
};

function detectAge(text: string): number | undefined {
  const patterns = [
    /\b(\d{1,3})\s*(?:yo|y\/o|year old|years old)\b/i,
    /\bage\s*(\d{1,3})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function detectDuration(text: string): string {
  const m = text.match(
    /\b(x\s*\d+\s*(?:hours?|days?|weeks?|months?)|\d+\s*(?:hours?|days?|weeks?|months?))\b/i
  );
  return m?.[1]?.trim() ?? "";
}

function hasAny(text: string, phrases: string[]): boolean {
  const lc = text.toLowerCase();
  return phrases.some((p) => lc.includes(p.toLowerCase()));
}

export async function collectModifiers(
  context: SkillContext
): Promise<SkillResult<CollectModifiersResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const raw = safeString(context.rawText);
  const transcriptText = (context.transcript ?? []).map((t) => t.text).join(" ");
  const source = `${raw} ${transcriptText}`.trim();

  const existing = { ...(context.modifiers ?? {}) };
  const modifiers: Record<string, any> = { ...existing };

  const inferredAge = detectAge(source);
  if (modifiers.age == null && inferredAge != null) modifiers.age = inferredAge;

  if (!modifiers.duration) {
    const d = detectDuration(source);
    if (d) modifiers.duration = d;
  }

  if (modifiers.sex == null) {
    if (hasAny(source, ["male", "man", "boy"])) modifiers.sex = "male";
    if (hasAny(source, ["female", "woman", "girl"])) modifiers.sex = "female";
  }

  if (modifiers.pregnancy_possible == null) {
    if (hasAny(source, ["pregnant", "pregnancy"])) modifiers.pregnancy_possible = true;
  }

  if (modifiers.immunocompromised == null) {
    modifiers.immunocompromised = hasAny(source, [
      "immunocompromised",
      "chemotherapy",
      "chemo",
      "transplant",
      "hiv",
      "steroids",
      "prednisone",
    ]);
  }

  if (modifiers.allergies == null) {
    modifiers.allergies = [];
  }

  if (modifiers.medications == null) {
    modifiers.medications = [];
  }

  if (modifiers.pmh == null) {
    modifiers.pmh = [];
  }

  const risk_tags: string[] = [];
  if (typeof modifiers.age === "number" && modifiers.age < 3) risk_tags.push("very_young");
  if (typeof modifiers.age === "number" && modifiers.age >= 65) risk_tags.push("elderly");
  if (modifiers.immunocompromised) risk_tags.push("immunocompromised");
  if (modifiers.pregnancy_possible) risk_tags.push("pregnancy_consideration");

  const missing_fields: string[] = [];
  for (const field of ["age", "duration", "medications", "allergies", "pmh"]) {
    const val = modifiers[field];
    const empty =
      val == null ||
      val === "" ||
      (Array.isArray(val) && val.length === 0);
    if (empty) missing_fields.push(field);
  }

  const result: SkillResult<CollectModifiersResult> = {
    skillId: "SK001",
    skillName: "collect_modifiers",
    version: "v1",
    status: "success",
    confidence: 0.86,
    result: {
      modifiers,
      missing_fields,
      risk_tags,
    },
    audit: {
      tablesUsed: ["GLOBAL_MODIFIERS"],
      ruleHits: [
        inferredAge != null ? "AGE_INFERRED" : "",
        modifiers.duration ? "DURATION_INFERRED" : "",
        modifiers.immunocompromised ? "IMMUNO_RISK_FLAG" : "",
      ].filter(Boolean),
      missingData: missing_fields,
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["extract_med_to_condition_triggers", "identify_chief_complaint"],
  };

  assertSkillResultShape(result, "collect_modifiers");
  return result;
}
