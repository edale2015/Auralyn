import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type NormalizePatientStoryResult = {
  symptom_timeline: string;
  associated_symptoms: string[];
  negated_symptoms: string[];
  extracted_measurements: Record<string, any>;
  structured_facts: Record<string, any>;
};

const COMMON_POSITIVES = [
  "fever",
  "cough",
  "sore throat",
  "throat pain",
  "shortness of breath",
  "sob",
  "chest pain",
  "abdominal pain",
  "nausea",
  "vomiting",
  "diarrhea",
  "rash",
  "ear pain",
  "sinus pressure",
  "headache",
  "fatigue",
  "body aches",
  "dysuria",
  "burning when urinating",
  "burning urination",
  "frequency",
  "urgency",
  "confused",
  "confusion",
];

const COMMON_NEGATIONS = [
  "no fever",
  "no cough",
  "no shortness of breath",
  "no chest pain",
  "no vomiting",
  "no diarrhea",
  "no rash",
  "no abdominal pain",
  "no urinary symptoms",
  "denies fever",
  "denies cough",
  "denies shortness of breath",
  "denies chest pain",
];

function buildSourceText(context: SkillContext): string {
  return [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ]
    .join(" ")
    .trim();
}

function extractTemperature(text: string): number | undefined {
  const match = text.match(/\b(?:temp|temperature|fever)\s*(?:of)?\s*(\d{2,3}(?:\.\d)?)\b/i);
  if (!match) return undefined;
  const val = Number(match[1]);
  return Number.isFinite(val) ? val : undefined;
}

function extractDuration(text: string): string {
  const match = text.match(/\b(?:x\s*)?(\d+\s*(?:hours?|days?|weeks?|months?))\b/i);
  return match?.[1]?.trim() ?? "";
}

function hasPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

export async function normalizePatientStory(
  context: SkillContext
): Promise<SkillResult<NormalizePatientStoryResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "normalize_patient_story");

  const source = buildSourceText(context);
  const lower = source.toLowerCase();

  const associated_symptoms = COMMON_POSITIVES.filter((term) => hasPhrase(lower, term));
  const negated_symptoms = COMMON_NEGATIONS.filter((term) => hasPhrase(lower, term));

  const extracted_measurements: Record<string, any> = {};
  const temp = extractTemperature(source);
  if (temp != null) extracted_measurements.temperature_f = temp;

  const duration = extractDuration(source);
  const symptom_timeline = duration || context.modifiers?.duration || "";

  const structured_facts: Record<string, any> = {
    complaint_id: context.complaintId,
    age: context.modifiers?.age,
    duration: symptom_timeline,
    fever_present:
      associated_symptoms.includes("fever") &&
      !negated_symptoms.includes("no fever") &&
      !negated_symptoms.includes("denies fever"),
    cough_present:
      associated_symptoms.includes("cough") &&
      !negated_symptoms.includes("no cough") &&
      !negated_symptoms.includes("denies cough"),
    sore_throat_present:
      associated_symptoms.includes("sore throat") ||
      associated_symptoms.includes("throat pain"),
    sob_present:
      (associated_symptoms.includes("shortness of breath") ||
      associated_symptoms.includes("sob")) &&
      !negated_symptoms.includes("no shortness of breath") &&
      !negated_symptoms.includes("denies shortness of breath"),
    chest_pain_present:
      associated_symptoms.includes("chest pain") &&
      !negated_symptoms.includes("no chest pain") &&
      !negated_symptoms.includes("denies chest pain"),
    dysuria_present:
      associated_symptoms.includes("dysuria") ||
      associated_symptoms.includes("burning when urinating") ||
      associated_symptoms.includes("burning urination"),
    confusion_present:
      associated_symptoms.includes("confused") ||
      associated_symptoms.includes("confusion"),
    urinary_frequency_present: associated_symptoms.includes("frequency"),
    rash_present:
      associated_symptoms.includes("rash") &&
      !negated_symptoms.includes("no rash"),
    abdominal_pain_present:
      associated_symptoms.includes("abdominal pain") &&
      !negated_symptoms.includes("no abdominal pain"),
  };

  const result: SkillResult<NormalizePatientStoryResult> = {
    skillId: "SK004",
    skillName: "normalize_patient_story",
    version: "v1",
    status: "success",
    confidence: 0.87,
    result: {
      symptom_timeline,
      associated_symptoms,
      negated_symptoms,
      extracted_measurements,
      structured_facts,
    },
    audit: {
      tablesUsed: ["COMPLAINT_REGISTRY"],
      ruleHits: [
        symptom_timeline ? "TIMELINE_EXTRACTED" : "",
        temp != null ? "TEMP_EXTRACTED" : "",
        associated_symptoms.length ? "SYMPTOMS_NORMALIZED" : "",
      ].filter(Boolean),
      missingData: symptom_timeline ? [] : ["duration"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["detect_red_flags", "score_differential_clusters"],
  };

  assertSkillResultShape(result, "normalize_patient_story");
  return result;
}
