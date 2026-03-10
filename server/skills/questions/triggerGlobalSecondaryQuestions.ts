import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

type TriggeredBundle = {
  trigger_source: string;
  bundle_name: string;
  questions: string[];
  priority: number;
};

type TriggerGlobalSecondaryQuestionsResult = {
  triggered_question_bundles: TriggeredBundle[];
  priority_order: string[];
};

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[|;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function builtInFallbackBundles(context: SkillContext): TriggeredBundle[] {
  const modifiers = context.modifiers ?? {};
  const meds = normalizeList(modifiers.medications);
  const pmh = normalizeList(modifiers.pmh);
  const bundles: TriggeredBundle[] = [];

  if (modifiers.immunocompromised) {
    bundles.push({
      trigger_source: "modifier:immunocompromised",
      bundle_name: "immunocompromised_risk_bundle",
      questions: [
        "Are you on chemotherapy, chronic steroids, or transplant medications?",
        "Have you had fevers, shaking chills, or rapid worsening?",
        "Have you been recently hospitalized or had serious infections?",
      ],
      priority: 100,
    });
  }

  if (modifiers.pregnancy_possible) {
    bundles.push({
      trigger_source: "modifier:pregnancy_possible",
      bundle_name: "pregnancy_risk_bundle",
      questions: [
        "Could you be pregnant?",
        "When was your last menstrual period?",
        "Are you having pelvic pain, bleeding, or severe vomiting?",
      ],
      priority: 95,
    });
  }

  const medBlob = meds.join(" ").toLowerCase();
  if (medBlob.includes("eliquis") || medBlob.includes("xarelto") || medBlob.includes("warfarin")) {
    bundles.push({
      trigger_source: "medication:anticoagulant",
      bundle_name: "anticoagulation_bundle",
      questions: [
        "What do you take the blood thinner for?",
        "Any bleeding, black stools, coughing blood, or head injury?",
        "Any missed doses or recent dose changes?",
      ],
      priority: 90,
    });
  }

  if (medBlob.includes("albuterol") || medBlob.includes("symbicort") || medBlob.includes("advair")) {
    bundles.push({
      trigger_source: "medication:inhaler",
      bundle_name: "asthma_copd_bundle",
      questions: [
        "Do you have asthma or COPD?",
        "How often are you using your rescue inhaler?",
        "Any wheezing, nighttime symptoms, or worsening shortness of breath?",
      ],
      priority: 85,
    });
  }

  const pmhBlob = pmh.join(" ").toLowerCase();
  if (pmhBlob.includes("diabetes")) {
    bundles.push({
      trigger_source: "pmh:diabetes",
      bundle_name: "diabetes_risk_bundle",
      questions: [
        "What has your blood sugar been running?",
        "Any vomiting, dehydration, or confusion?",
        "Any foot wounds, urinary symptoms, or recurrent infections?",
      ],
      priority: 80,
    });
  }

  return bundles.sort((a, b) => b.priority - a.priority);
}

export async function triggerGlobalSecondaryQuestions(
  context: SkillContext
): Promise<SkillResult<TriggerGlobalSecondaryQuestionsResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "trigger_global_secondary_questions");

  const bundles: TriggeredBundle[] = [];
  const usedTables: string[] = [];

  try {
    const rows = await loadCsvTable("GLOBAL_SECONDARY.csv");
    if (rows.length) {
      usedTables.push("GLOBAL_SECONDARY");

      for (const row of rows) {
        const triggerType = getFirstValue(row, ["TRIGGER_TYPE", "Trigger_Type", "Type"]).toLowerCase();
        const triggerValue = getFirstValue(row, ["TRIGGER_VALUE", "Trigger_Value", "Trigger"]).toLowerCase();
        const bundleName =
          getFirstValue(row, ["BUNDLE_NAME", "Bundle_Name", "Bundle"]) || "global_secondary_bundle";
        const questions = normalizeList(
          getFirstValue(row, ["QUESTIONS", "Question_List", "Question_Text"])
        );
        const priority = Number(
          getFirstValue(row, ["PRIORITY", "Priority", "Weight"]) || "50"
        );

        const modifiers = context.modifiers ?? {};
        const meds = normalizeList(modifiers.medications).map((m) => m.toLowerCase());
        const pmh = normalizeList(modifiers.pmh).map((p) => p.toLowerCase());

        let matched = false;
        if (triggerType === "modifier") {
          matched = Boolean((modifiers as any)[triggerValue]);
        } else if (triggerType === "medication") {
          matched = meds.some((m) => m.includes(triggerValue));
        } else if (triggerType === "pmh") {
          matched = pmh.some((p) => p.includes(triggerValue));
        } else if (triggerType === "complaint") {
          matched = (context.complaintId ?? "").toLowerCase() === triggerValue;
        }

        if (matched && questions.length) {
          bundles.push({
            trigger_source: `${triggerType}:${triggerValue}`,
            bundle_name: bundleName,
            questions,
            priority,
          });
        }
      }
    }
  } catch {
  }

  try {
    const rows = await loadCsvTable("MED_TO_CONDITION_TRIGGERS.csv");
    if (rows.length) {
      usedTables.push("MED_TO_CONDITION_TRIGGERS");

      const meds = normalizeList(context.modifiers?.medications).map((m) => m.toLowerCase());

      for (const row of rows) {
        const medMatch = getFirstValue(row, ["MEDICATION", "Medication", "Med", "Trigger"]).toLowerCase();
        const bundleName =
          getFirstValue(row, ["BUNDLE_NAME", "Bundle_Name", "Condition", "Condition_Name"]) ||
          medMatch ||
          "medication_bundle";
        const questions = normalizeList(
          getFirstValue(row, ["FOLLOWUP_QUESTIONS", "Questions", "Question_List"])
        );
        const priority = Number(
          getFirstValue(row, ["PRIORITY", "Priority", "Weight"]) || "70"
        );

        if (!medMatch || !questions.length) continue;
        if (meds.some((m) => m.includes(medMatch))) {
          bundles.push({
            trigger_source: `medication:${medMatch}`,
            bundle_name: bundleName,
            questions,
            priority,
          });
        }
      }
    }
  } catch {
  }

  const finalBundles = bundles.length ? bundles : builtInFallbackBundles(context);
  const deduped = new Map<string, TriggeredBundle>();

  for (const bundle of finalBundles.sort((a, b) => b.priority - a.priority)) {
    if (!deduped.has(bundle.bundle_name)) deduped.set(bundle.bundle_name, bundle);
  }

  const triggered_question_bundles = [...deduped.values()];
  const priority_order = triggered_question_bundles.map((b) => b.bundle_name);

  const result: SkillResult<TriggerGlobalSecondaryQuestionsResult> = {
    skillId: "SK010",
    skillName: "trigger_global_secondary_questions",
    version: "v1",
    status: "success",
    confidence: 0.91,
    result: {
      triggered_question_bundles,
      priority_order,
    },
    audit: {
      tablesUsed: usedTables.length ? usedTables : ["GLOBAL_SECONDARY_FALLBACK"],
      ruleHits: triggered_question_bundles.map((b) => b.bundle_name),
      missingData: triggered_question_bundles.length ? [] : ["no_global_bundles_triggered"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["select_next_best_question", "check_consistency_and_gaps"],
  };

  assertSkillResultShape(result, "trigger_global_secondary_questions");
  return result;
}
