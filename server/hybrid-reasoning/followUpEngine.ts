export interface FollowUpQuestion {
  id: string;
  text: string;
  complaint: string;
  targetFeature: string;
  priority: number;
  expectedAnswerType: "yesno" | "text" | "number" | "choice";
  choices?: string[];
  extractedFeatureIfYes?: string;
  extractedFeatureIfNo?: string;
}

export interface InterviewState {
  complaint: string;
  answeredIds: Set<string>;
  extractedFeatures: Set<string>;
}

export interface FollowUpResult {
  hasQuestion: boolean;
  question?: FollowUpQuestion;
  interviewComplete: boolean;
  questionsAsked: number;
  questionsRemaining: number;
}

const QUESTION_BANKS: Record<string, FollowUpQuestion[]> = {
  chest_pain: [
    { id: "cp_duration", text: "How long have you had this chest pain?", complaint: "chest_pain", targetFeature: "duration", priority: 1, expectedAnswerType: "text", extractedFeatureIfYes: "duration_known" },
    { id: "cp_radiation", text: "Does the pain spread to your arm, jaw, or back?", complaint: "chest_pain", targetFeature: "radiates_left_arm", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "radiates_left_arm" },
    { id: "cp_sweat", text: "Are you sweating unusually — clammy or drenched?", complaint: "chest_pain", targetFeature: "diaphoresis", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "diaphoresis" },
    { id: "cp_breath", text: "Are you having any difficulty breathing?", complaint: "chest_pain", targetFeature: "shortness_of_breath", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "shortness_of_breath" },
    { id: "cp_character", text: "Is the pain pressure-like, squeezing, or sharp?", complaint: "chest_pain", targetFeature: "character", priority: 5, expectedAnswerType: "choice", choices: ["Pressure/squeezing", "Sharp/stabbing", "Burning", "Dull"], extractedFeatureIfYes: "chest_tightness" },
    { id: "cp_exertion", text: "Does the pain get worse with activity or exertion?", complaint: "chest_pain", targetFeature: "exertional", priority: 6, expectedAnswerType: "yesno", extractedFeatureIfYes: "exertional_chest_pain" },
  ],
  headache: [
    { id: "ha_severity", text: "On a scale of 1–10, how severe is the headache right now?", complaint: "headache", targetFeature: "severity", priority: 1, expectedAnswerType: "number" },
    { id: "ha_worst", text: "Is this the worst headache of your life — did it come on suddenly and intensely?", complaint: "headache", targetFeature: "worst_headache", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "worst_headache" },
    { id: "ha_neck", text: "Do you have a stiff neck — difficulty bending your chin to your chest?", complaint: "headache", targetFeature: "neck_stiffness", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "neck_stiffness" },
    { id: "ha_fever", text: "Do you have a fever or feel feverish?", complaint: "headache", targetFeature: "fever", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "fever" },
    { id: "ha_vision", text: "Any changes in your vision — blurriness, double vision, or seeing halos?", complaint: "headache", targetFeature: "vision_changes", priority: 5, expectedAnswerType: "yesno", extractedFeatureIfYes: "vision_changes" },
    { id: "ha_location", text: "Where is the headache located — one side, both sides, or behind your eyes?", complaint: "headache", targetFeature: "location", priority: 6, expectedAnswerType: "text" },
    { id: "ha_trauma", text: "Did you have any recent head injury or trauma?", complaint: "headache", targetFeature: "trauma", priority: 7, expectedAnswerType: "yesno", extractedFeatureIfYes: "head_trauma" },
  ],
  cough: [
    { id: "cough_duration", text: "How long have you had the cough?", complaint: "cough", targetFeature: "duration", priority: 1, expectedAnswerType: "text" },
    { id: "cough_phlegm", text: "Are you coughing up any phlegm or mucus? If so, what color?", complaint: "cough", targetFeature: "productive_cough", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "productive_cough" },
    { id: "cough_breath", text: "Are you having difficulty breathing or shortness of breath?", complaint: "cough", targetFeature: "shortness_of_breath", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "shortness_of_breath" },
    { id: "cough_fever", text: "Do you have a fever?", complaint: "cough", targetFeature: "fever", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "fever" },
    { id: "cough_worse", text: "Does the cough get worse when you lie down or at night?", complaint: "cough", targetFeature: "nocturnal", priority: 5, expectedAnswerType: "yesno" },
    { id: "cough_blood", text: "Have you coughed up any blood?", complaint: "cough", targetFeature: "hemoptysis", priority: 6, expectedAnswerType: "yesno", extractedFeatureIfYes: "hemoptysis" },
  ],
  fever: [
    { id: "fever_temp", text: "What is your temperature? (if measured)", complaint: "fever", targetFeature: "temperature", priority: 1, expectedAnswerType: "text" },
    { id: "fever_duration", text: "How many days have you had the fever?", complaint: "fever", targetFeature: "duration", priority: 2, expectedAnswerType: "number" },
    { id: "fever_neck", text: "Do you have a stiff neck or severe headache?", complaint: "fever", targetFeature: "neck_stiffness", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "neck_stiffness" },
    { id: "fever_rash", text: "Do you have any rash — especially one that doesn't fade when pressed?", complaint: "fever", targetFeature: "petechiae", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "petechiae" },
    { id: "fever_confusion", text: "Are you or is the patient confused or not acting normally?", complaint: "fever", targetFeature: "confusion", priority: 5, expectedAnswerType: "yesno", extractedFeatureIfYes: "confusion" },
    { id: "fever_source", text: "Do you have any pain that might indicate a source — throat, urine, stomach, lungs?", complaint: "fever", targetFeature: "source", priority: 6, expectedAnswerType: "text" },
  ],
  abdominal_pain: [
    { id: "abd_location", text: "Where exactly is the pain — upper, lower, right, left, or all over?", complaint: "abdominal_pain", targetFeature: "location", priority: 1, expectedAnswerType: "text" },
    { id: "abd_pregnancy", text: "Could you be pregnant or have you had a positive pregnancy test?", complaint: "abdominal_pain", targetFeature: "positive_pregnancy_test", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "positive_pregnancy_test" },
    { id: "abd_rigid", text: "Is your abdomen very hard or rigid to the touch?", complaint: "abdominal_pain", targetFeature: "abdominal_rigidity", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "abdominal_rigidity" },
    { id: "abd_vomit", text: "Have you been vomiting? Any blood or coffee-ground material?", complaint: "abdominal_pain", targetFeature: "vomiting", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "vomiting" },
    { id: "abd_bowel", text: "Any changes in bowel movements — diarrhea, no stool, or blood in stool?", complaint: "abdominal_pain", targetFeature: "bowel_changes", priority: 5, expectedAnswerType: "text" },
    { id: "abd_duration", text: "How long have you had this pain?", complaint: "abdominal_pain", targetFeature: "duration", priority: 6, expectedAnswerType: "text" },
  ],
  sore_throat: [
    { id: "st_swallow", text: "Are you having difficulty swallowing or drooling?", complaint: "sore_throat", targetFeature: "drooling", priority: 1, expectedAnswerType: "yesno", extractedFeatureIfYes: "drooling" },
    { id: "st_voice", text: "Has your voice changed — muffled or hot potato voice?", complaint: "sore_throat", targetFeature: "muffled_voice", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "muffled_voice" },
    { id: "st_fever", text: "Do you have a fever?", complaint: "sore_throat", targetFeature: "fever", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "fever" },
    { id: "st_cough", text: "Do you have a cough along with the sore throat?", complaint: "sore_throat", targetFeature: "cough", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "cough" },
    { id: "st_duration", text: "How long have you had the sore throat?", complaint: "sore_throat", targetFeature: "duration", priority: 5, expectedAnswerType: "text" },
    { id: "st_exposure", text: "Have you been around anyone with confirmed strep throat?", complaint: "sore_throat", targetFeature: "exposure", priority: 6, expectedAnswerType: "yesno" },
  ],
  anxiety: [
    { id: "anx_flight", text: "Have you taken a long flight or been on prolonged bed rest recently?", complaint: "anxiety", targetFeature: "recent_immobility", priority: 1, expectedAnswerType: "yesno", extractedFeatureIfYes: "recent_immobility" },
    { id: "anx_leg", text: "Do you have any swelling, redness, or pain in one leg?", complaint: "anxiety", targetFeature: "unilateral_leg_swelling", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "unilateral_leg_swelling" },
    { id: "anx_heart", text: "Is your heart racing or beating irregularly?", complaint: "anxiety", targetFeature: "tachycardia", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "tachycardia" },
    { id: "anx_breath", text: "Are you having difficulty breathing or chest pain?", complaint: "anxiety", targetFeature: "shortness_of_breath", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "shortness_of_breath" },
    { id: "anx_trigger", text: "Does the anxiety come on in specific situations, or is it constant?", complaint: "anxiety", targetFeature: "trigger", priority: 5, expectedAnswerType: "text" },
  ],
  dizziness: [
    { id: "diz_spinning", text: "Is the room spinning around you, or do you feel lightheaded/faint?", complaint: "dizziness", targetFeature: "vertigo_vs_presyncope", priority: 1, expectedAnswerType: "choice", choices: ["Room is spinning", "Feeling faint/lightheaded", "Both"] },
    { id: "diz_neuro", text: "Any difficulty speaking, double vision, or weakness in your limbs?", complaint: "dizziness", targetFeature: "neuro_symptoms", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "confusion" },
    { id: "diz_hearing", text: "Do you have hearing loss or ringing in your ears?", complaint: "dizziness", targetFeature: "tinnitus", priority: 3, expectedAnswerType: "yesno" },
    { id: "diz_positional", text: "Does the dizziness come on when you change positions?", complaint: "dizziness", targetFeature: "positional", priority: 4, expectedAnswerType: "yesno" },
    { id: "diz_duration", text: "How long do the episodes last — seconds, minutes, or constant?", complaint: "dizziness", targetFeature: "duration", priority: 5, expectedAnswerType: "text" },
  ],
  uti: [
    { id: "uti_fever", text: "Do you have a fever or chills?", complaint: "uti", targetFeature: "fever", priority: 1, expectedAnswerType: "yesno", extractedFeatureIfYes: "fever" },
    { id: "uti_flank", text: "Do you have pain in your side or back (flank area)?", complaint: "uti", targetFeature: "flank_pain", priority: 2, expectedAnswerType: "yesno" },
    { id: "uti_pregnant", text: "Are you pregnant or could you be pregnant?", complaint: "uti", targetFeature: "pregnancy", priority: 3, expectedAnswerType: "yesno" },
    { id: "uti_blood", text: "Is there any blood in your urine?", complaint: "uti", targetFeature: "hematuria", priority: 4, expectedAnswerType: "yesno" },
    { id: "uti_duration", text: "How long have you had these urinary symptoms?", complaint: "uti", targetFeature: "duration", priority: 5, expectedAnswerType: "text" },
  ],
  shortness_of_breath: [
    { id: "sob_onset", text: "Did the shortness of breath come on suddenly or gradually?", complaint: "shortness_of_breath", targetFeature: "onset", priority: 1, expectedAnswerType: "choice", choices: ["Sudden (seconds/minutes)", "Gradual (hours/days)"] },
    { id: "sob_immobility", text: "Have you been on bed rest, a long flight, or otherwise immobile recently?", complaint: "shortness_of_breath", targetFeature: "recent_immobility", priority: 2, expectedAnswerType: "yesno", extractedFeatureIfYes: "recent_immobility" },
    { id: "sob_pleuritic", text: "Is the breathing worse or painful when you take a deep breath?", complaint: "shortness_of_breath", targetFeature: "pleuritic_pain", priority: 3, expectedAnswerType: "yesno", extractedFeatureIfYes: "pleuritic_pain" },
    { id: "sob_leg", text: "Any swelling or pain in one leg?", complaint: "shortness_of_breath", targetFeature: "unilateral_leg_swelling", priority: 4, expectedAnswerType: "yesno", extractedFeatureIfYes: "unilateral_leg_swelling" },
    { id: "sob_history", text: "Do you have a history of asthma, COPD, or heart failure?", complaint: "shortness_of_breath", targetFeature: "cardiac_history", priority: 5, expectedAnswerType: "text" },
  ],
  default: [
    { id: "def_duration", text: "How long have you had these symptoms?", complaint: "default", targetFeature: "duration", priority: 1, expectedAnswerType: "text" },
    { id: "def_severity", text: "On a scale of 1–10, how severe are your symptoms?", complaint: "default", targetFeature: "severity", priority: 2, expectedAnswerType: "number" },
    { id: "def_history", text: "Do you have any relevant medical history or recent illnesses?", complaint: "default", targetFeature: "pmh", priority: 3, expectedAnswerType: "text" },
    { id: "def_medications", text: "Are you taking any medications or have any allergies?", complaint: "default", targetFeature: "medications", priority: 4, expectedAnswerType: "text" },
  ],
};

const MAX_QUESTIONS_PER_SESSION = 5;

export function getNextQuestion(
  complaint: string,
  answeredIds: string[],
  extractedFeatures: string[]
): FollowUpResult {
  const bank = QUESTION_BANKS[complaint] ?? QUESTION_BANKS.default;
  const answeredSet = new Set(answeredIds);
  const featureSet = new Set(extractedFeatures);

  const remaining = bank
    .filter(q => {
      if (answeredSet.has(q.id)) return false;
      if (q.targetFeature !== "duration" && q.targetFeature !== "severity" && q.targetFeature !== "text" && featureSet.has(q.targetFeature)) return false;
      return true;
    })
    .sort((a, b) => a.priority - b.priority);

  const totalAsked = answeredIds.length;

  if (remaining.length === 0 || totalAsked >= MAX_QUESTIONS_PER_SESSION) {
    return { hasQuestion: false, interviewComplete: true, questionsAsked: totalAsked, questionsRemaining: 0 };
  }

  return {
    hasQuestion: true,
    question: remaining[0],
    interviewComplete: false,
    questionsAsked: totalAsked,
    questionsRemaining: remaining.length,
  };
}

export function extractFeaturesFromAnswer(question: FollowUpQuestion, answer: string): string[] {
  const lower = answer.toLowerCase().trim();
  const isYes = ["yes", "y", "yeah", "yep", "true", "definitely", "correct", "positive"].some(w => lower.startsWith(w) || lower === w);
  const isNo = ["no", "n", "nope", "negative", "not", "never"].some(w => lower.startsWith(w) || lower === w);
  const features: string[] = [];

  if (question.expectedAnswerType === "yesno") {
    if (isYes && question.extractedFeatureIfYes) features.push(question.extractedFeatureIfYes);
    if (isNo && question.extractedFeatureIfNo) features.push(question.extractedFeatureIfNo);
  } else if (question.expectedAnswerType === "choice") {
    if (question.extractedFeatureIfYes && answer.toLowerCase().includes("yes")) {
      features.push(question.extractedFeatureIfYes);
    }
    if (question.id === "cp_character" && (lower.includes("pressure") || lower.includes("squeezing"))) {
      features.push("chest_tightness");
    }
    if (question.id === "diz_spinning" && lower.includes("spinning")) {
      features.push("vertigo");
    }
    if (question.id === "sob_onset" && lower.includes("sudden")) {
      features.push("sudden_onset");
    }
  } else if (question.expectedAnswerType === "number") {
    const num = parseFloat(answer);
    if (!isNaN(num)) {
      if (question.id === "ha_severity" && num >= 8) features.push("severe_headache");
      if (question.id === "fever_duration" && num >= 5) features.push("prolonged_fever");
    }
  }

  if (lower.includes("blood") || lower.includes("bleeding")) features.push("hematuria");
  if (lower.includes("7 days") || lower.includes("week") || lower.includes("weeks")) features.push("duration_7_days");
  if (lower.includes("3 days") || lower.includes("three days")) features.push("duration_3_days");

  return features;
}

export function buildInterviewSummary(
  answeredIds: string[],
  extractedFeatures: string[],
  answers: Record<string, string>
): string {
  const lines = ["Clinical Interview Summary:", ""];
  for (const [questionId, answer] of Object.entries(answers)) {
    const allQuestions = Object.values(QUESTION_BANKS).flat();
    const q = allQuestions.find(q => q.id === questionId);
    if (q) lines.push(`Q: ${q.text}\nA: ${answer}`);
  }
  if (extractedFeatures.length > 0) {
    lines.push("", `Features extracted from interview: ${extractedFeatures.join(", ")}`);
  }
  return lines.join("\n");
}
