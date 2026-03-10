import { canonicalizeComplaintId } from "./complaintAliasRegistry";

export type SyntheticAnswerBundle = {
  answers: Record<string, string>;
  factDebug: Record<string, any>;
};

function triState(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function maybeNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function buildSyntheticAnswers(
  complaintId: string,
  facts: Record<string, any>,
  modifiers: Record<string, any> = {}
): SyntheticAnswerBundle {
  const canonical = canonicalizeComplaintId(complaintId);

  const prefixMap: Record<string, string[]> = {
    sore_throat: ["ST_"],
    cough: ["COUGH_", "PCO_"],
    uti: ["UTI_", "GU_"],
    chest_pain: ["CP_", "CARD_"],
    abdominal_pain: ["ABD_", "GI_"],
    fever: ["FEVER_"],
    rash: ["RASH_"],
    ear_pain: ["EAR_", "ENT_"],
    sinus_pressure: ["SINUS_", "ENT_"],
  };

  const prefixes = prefixMap[canonical] ?? ["GEN_"];
  const answers: Record<string, string> = {};

  const yesNoFacts: Record<string, unknown> = {
    FEVER: facts.fever_present,
    COUGH: facts.cough_present,
    COUGH_NEGATED: facts.cough_negated,
    SORE_THROAT: facts.sore_throat_present,
    SOB: facts.sob_present,
    CHEST_PAIN: facts.chest_pain_present,
    ABDOMINAL_PAIN: facts.abdominal_pain_present,
    RASH: facts.rash_present,
    DYSURIA: facts.dysuria_present,
    FREQUENCY: facts.urinary_frequency_present,
    URGENCY: facts.urinary_urgency_present,
    DROOLING: facts.drooling_present,
    STRIDOR: facts.stridor_present,
    MUFFLED_VOICE: facts.muffled_voice_present,
    CANNOT_SWALLOW: facts.cannot_swallow_present,
    CONFUSION: facts.confusion_present,
    VOMITING: facts.vomiting_present,
    DIARRHEA: facts.diarrhea_present,
  };

  for (const prefix of prefixes) {
    for (const [key, value] of Object.entries(yesNoFacts)) {
      answers[`Q_${prefix}${key}`] = triState(value);
    }
  }

  answers["Q_AGE"] = maybeNumber(modifiers.age ?? facts.age);
  answers["Q_DURATION_DAYS"] = maybeNumber(facts.duration_days);
  answers["Q_TEMP_F"] = maybeNumber(facts.temperature_f ?? facts.extracted_temperature_f);

  answers["Q_IMMUNOCOMPROMISED"] = triState(modifiers.immunocompromised);
  answers["Q_PREGNANCY_POSSIBLE"] = triState(modifiers.pregnancy_possible);

  return {
    answers,
    factDebug: {
      canonicalComplaint: canonical,
      prefixes,
      facts,
      modifiers,
    },
  };
}
