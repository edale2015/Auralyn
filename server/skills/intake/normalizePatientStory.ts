import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { extractAssertions, phrasePresent, phraseNegated } from "../shared/negationHelper";

type NormalizePatientStoryResult = {
  symptom_timeline: string;
  associated_symptoms: string[];
  negated_symptoms: string[];
  extracted_measurements: Record<string, any>;
  structured_facts: Record<string, any>;
};

const TRACKED_SYMPTOMS = [
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
  "drooling",
  "stridor",
  "muffled voice",
  "cannot swallow",
  "confused",
  "confusion",
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

export async function normalizePatientStory(
  context: SkillContext
): Promise<SkillResult<NormalizePatientStoryResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "normalize_patient_story");

  const source = buildSourceText(context);
  const assertions = extractAssertions(source, TRACKED_SYMPTOMS);

  const extracted_measurements: Record<string, any> = {};
  const temp = extractTemperature(source);
  if (temp != null) extracted_measurements.temperature_f = temp;

  const duration = extractDuration(source);
  const symptom_timeline = duration || context.modifiers?.duration || "";

  const structured_facts: Record<string, any> = {
    complaint_id: context.complaintId,
    age: context.modifiers?.age,
    duration: symptom_timeline,
    fever_present: phrasePresent(source, "fever"),
    cough_present: phrasePresent(source, "cough"),
    sore_throat_present:
      phrasePresent(source, "sore throat") || phrasePresent(source, "throat pain"),
    sob_present:
      phrasePresent(source, "shortness of breath") || phrasePresent(source, "sob"),
    chest_pain_present: phrasePresent(source, "chest pain"),
    abdominal_pain_present: phrasePresent(source, "abdominal pain"),
    rash_present: phrasePresent(source, "rash"),
    dysuria_present:
      phrasePresent(source, "dysuria") ||
      phrasePresent(source, "burning when urinating") ||
      phrasePresent(source, "burning urination"),
    urinary_frequency_present: phrasePresent(source, "frequency"),
    urinary_urgency_present: phrasePresent(source, "urgency"),
    drooling_present: phrasePresent(source, "drooling"),
    stridor_present: phrasePresent(source, "stridor"),
    muffled_voice_present: phrasePresent(source, "muffled voice"),
    cannot_swallow_present: phrasePresent(source, "cannot swallow"),
    confusion_present:
      phrasePresent(source, "confused") || phrasePresent(source, "confusion"),
    cough_negated: phraseNegated(source, "cough"),
  };

  const result: SkillResult<NormalizePatientStoryResult> = {
    skillId: "SK004",
    skillName: "normalize_patient_story",
    version: "v1",
    status: "success",
    confidence: 0.9,
    result: {
      symptom_timeline,
      associated_symptoms: assertions.affirmed,
      negated_symptoms: assertions.negated,
      extracted_measurements,
      structured_facts,
    },
    audit: {
      tablesUsed: ["NEGATION_HELPER", "COMPLAINT_REGISTRY"],
      ruleHits: [
        symptom_timeline ? "TIMELINE_EXTRACTED" : "",
        temp != null ? "TEMP_EXTRACTED" : "",
        assertions.affirmed.length ? "NEGATION_AWARE_NORMALIZATION" : "",
      ].filter(Boolean),
      missingData: symptom_timeline ? [] : ["duration"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["detect_red_flags", "score_differential_clusters"],
  };

  assertSkillResultShape(result, "normalize_patient_story");
  return result;
}
