import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

type ConditionTrigger = {
  condition: string;
  confidence: number;
  matched_medications: string[];
};

type ExtractMedToConditionTriggersResult = {
  suspected_conditions: ConditionTrigger[];
  follow_up_questions: string[];
  confidence_by_condition: Record<string, number>;
};

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[|;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

type BuiltInMedRule = {
  meds: string[];
  condition: string;
  confidence: number;
  questions: string[];
};

const BUILT_IN_MED_RULES: BuiltInMedRule[] = [
  {
    meds: ["eliquis", "apixaban", "xarelto", "rivaroxaban", "warfarin", "coumadin"],
    condition: "anticoagulation_history",
    confidence: 0.9,
    questions: [
      "What do you take the blood thinner for?",
      "Any bleeding, black stools, coughing blood, or head injury?",
      "Any missed doses or recent dose changes?",
    ],
  },
  {
    meds: ["albuterol", "ventolin", "proair", "symbicort", "advair", "flovent"],
    condition: "asthma_or_copd_history",
    confidence: 0.86,
    questions: [
      "Do you have asthma or COPD?",
      "How often are you using your rescue inhaler?",
      "Any wheezing, nighttime symptoms, or worsening shortness of breath?",
    ],
  },
  {
    meds: ["metformin", "glipizide", "jardiance", "empagliflozin", "ozempic", "insulin"],
    condition: "diabetes_history",
    confidence: 0.88,
    questions: [
      "Do you have diabetes?",
      "What have your blood sugars been running?",
      "Any vomiting, dehydration, or confusion?",
    ],
  },
  {
    meds: ["lasix", "furosemide", "torsemide", "bumex"],
    condition: "heart_failure_or_volume_issue_history",
    confidence: 0.72,
    questions: [
      "Do you take this for heart failure or fluid retention?",
      "Any swelling, orthopnea, or sudden weight gain?",
    ],
  },
  {
    meds: ["metoprolol", "carvedilol", "diltiazem", "amiodarone", "digoxin"],
    condition: "arrhythmia_or_rate_control_history",
    confidence: 0.65,
    questions: [
      "Do you take this for atrial fibrillation or another heart rhythm problem?",
      "Any palpitations, dizziness, or fainting?",
    ],
  },
  {
    meds: ["prednisone", "methylprednisolone", "dexamethasone"],
    condition: "steroid_exposure_or_immunosuppression",
    confidence: 0.78,
    questions: [
      "Are you on steroids right now or recently?",
      "What dose and for how long?",
      "Any diabetes, infection, or immune suppression concerns?",
    ],
  },
];

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function normalizeMedText(med: string): string {
  return med.toLowerCase().trim();
}

export async function extractMedToConditionTriggers(
  context: SkillContext
): Promise<SkillResult<ExtractMedToConditionTriggersResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const medications = normalizeList(context.modifiers?.medications).map(normalizeMedText);

  const suspectedMap = new Map<string, ConditionTrigger>();
  const followUpQuestions: string[] = [];
  const tablesUsed: string[] = [];
  const ruleHits: string[] = [];

  let csvRows: CsvRow[] = [];
  try {
    csvRows = await loadCsvTable("MED_TO_CONDITION_TRIGGERS.csv");
  } catch {
    csvRows = [];
  }

  if (csvRows.length) {
    tablesUsed.push("MED_TO_CONDITION_TRIGGERS");

    for (const row of csvRows) {
      const medTrigger = getFirstValue(row, [
        "MEDICATION",
        "Medication",
        "MED",
        "Trigger",
        "TRIGGER_MED",
      ]).toLowerCase();

      const condition = getFirstValue(row, [
        "CONDITION",
        "Condition",
        "Condition_Name",
        "Bundle_Name",
      ]);

      const confidence = Number(
        getFirstValue(row, ["CONFIDENCE", "Confidence", "Weight"]) || "0.8"
      );

      const questions = normalizeList(
        getFirstValue(row, ["FOLLOWUP_QUESTIONS", "Questions", "Question_List"])
      );

      if (!medTrigger || !condition) continue;

      const matchedMeds = medications.filter((m) => m.includes(medTrigger));
      if (!matchedMeds.length) continue;

      const existing = suspectedMap.get(condition) ?? {
        condition,
        confidence: 0,
        matched_medications: [],
      };

      existing.confidence = Math.max(existing.confidence, confidence);
      existing.matched_medications = dedupeStrings([
        ...existing.matched_medications,
        ...matchedMeds,
      ]);

      suspectedMap.set(condition, existing);
      followUpQuestions.push(...questions);
      ruleHits.push(`MED_TRIGGER_${medTrigger.toUpperCase()}`);
    }
  } else {
    tablesUsed.push("MED_TO_CONDITION_TRIGGERS_FALLBACK");

    for (const rule of BUILT_IN_MED_RULES) {
      const matchedMeds = medications.filter((m) =>
        rule.meds.some((r) => m.includes(r))
      );

      if (!matchedMeds.length) continue;

      const existing = suspectedMap.get(rule.condition) ?? {
        condition: rule.condition,
        confidence: 0,
        matched_medications: [],
      };

      existing.confidence = Math.max(existing.confidence, rule.confidence);
      existing.matched_medications = dedupeStrings([
        ...existing.matched_medications,
        ...matchedMeds,
      ]);

      suspectedMap.set(rule.condition, existing);
      followUpQuestions.push(...rule.questions);
      ruleHits.push(`MED_TRIGGER_${rule.condition.toUpperCase()}`);
    }
  }

  const suspected_conditions = [...suspectedMap.values()].sort(
    (a, b) => b.confidence - a.confidence
  );

  const confidence_by_condition: Record<string, number> = {};
  for (const item of suspected_conditions) {
    confidence_by_condition[item.condition] = item.confidence;
  }

  const result: SkillResult<ExtractMedToConditionTriggersResult> = {
    skillId: "SK002",
    skillName: "extract_med_to_condition_triggers",
    version: "v1",
    status: "success",
    confidence: suspected_conditions.length ? 0.9 : 0.8,
    result: {
      suspected_conditions,
      follow_up_questions: dedupeStrings(followUpQuestions),
      confidence_by_condition,
    },
    audit: {
      tablesUsed,
      ruleHits,
      missingData: medications.length ? [] : ["medications"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: [
      "trigger_global_secondary_questions",
      "run_complaint_question_bundle",
    ],
  };

  assertSkillResultShape(result, "extract_med_to_condition_triggers");
  return result;
}
