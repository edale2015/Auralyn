export interface ExtractionResult {
  complaint: string;
  features: string[];
  complaintsFound: number;
  featuresFound: number;
  confidence: number;
  missingFields: string[];
  canProceed: boolean;
  blockReason: string;
  nextQuestion: string;
  extractionLog: string[];
}

const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  chest_pain:     ["chest pain","chest tightness","chest pressure","palpitations","heart pain","breast pain"],
  sore_throat:    ["sore throat","throat pain","throat","tonsil","swallowing hurts","can't swallow"],
  cough:          ["cough","coughing","phlegm","sputum","bronchitis","whooping"],
  abdominal_pain: ["abdominal","stomach pain","belly","gut pain","nausea","vomiting","diarrhea","bowel","cramps","abdomen"],
  fever:          ["fever","temperature","hot","chills","rigors","sweating","night sweat","febrile"],
  uti:            ["burning urine","frequency","dysuria","urinary","bladder","urine pain","pee hurts","urination"],
  ear_pain:       ["ear pain","earache","ear discharge","hearing loss","ear hurts","ringing in ear"],
  rash:           ["rash","itching","hives","skin lesion","red spots","blotches","lesion","eruption"],
  sinus_pressure: ["sinus","nasal","congestion","stuffed","facial pressure","runny nose","stuffy"],
  headache:       ["headache","migraine","head pain","head pressure","head hurts","skull"],
  dizziness:      ["dizziness","dizzy","vertigo","lightheaded","spinning","unsteady"],
  back_pain:      ["back pain","back ache","lumbar","spine","sciatica","lower back"],
  anxiety:        ["anxiety","panic","anxious","nervous","stress","worry","panic attack"],
  syncope:        ["fainted","passed out","blackout","syncope","loss of consciousness"],
  edema:          ["swelling","swollen","edema","puffy","bloated legs","swollen ankles"],
  vomiting:       ["vomiting","throwing up","nausea","puking","emesis","retching"],
  eye_pain:       ["eye pain","eye red","vision","blurry vision","eye discharge","conjunctivitis"],
  toothache:      ["tooth pain","toothache","jaw pain","dental","gum pain"],
  shortness_of_breath: ["short of breath","can't breathe","breathless","difficulty breathing","SOB"],
  palpitations:   ["palpitations","heart racing","fast heart","irregular heartbeat","heart flutter"],
};

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  fever:               ["fever","high temperature","hot","burning up","febrile"],
  cough:               ["cough","coughing","whooping"],
  shortness_of_breath: ["short of breath","trouble breathing","breathless","can't breathe","wheezing","SOB"],
  chest_tightness:     ["tightness","pressure in chest","chest tight","squeezing"],
  radiates_left_arm:   ["arm pain","radiates to arm","left arm","jaw pain"],
  diaphoresis:         ["sweating","drenched","diaphoresis","clammy","soaking"],
  drooling:            ["drooling","can't swallow saliva","excess saliva"],
  muffled_voice:       ["muffled","hot potato voice","voice changed","hoarse"],
  neck_stiffness:      ["stiff neck","neck stiffness","can't bend neck","neck pain"],
  confusion:           ["confused","disoriented","not making sense","altered","delirious"],
  vomiting:            ["vomiting","throwing up","nausea","puking"],
  diarrhea:            ["diarrhea","loose stool","watery stool","bowel movement"],
  rash:                ["rash","red spots","skin lesion","hives"],
  petechiae:           ["petechiae","non-blanching","purple dots","dots"],
  worst_headache:      ["worst headache","thunderclap","sudden severe headache"],
  vision_changes:      ["blurry vision","double vision","vision loss","visual"],
  tachycardia:         ["fast heart","racing heart","palpitations","rapid pulse"],
  hypoxia:             ["low oxygen","oxygen level","fingertips blue","bluish"],
  abdominal_rigidity:  ["rigid","board-like","guarding","rebound"],
  positive_pregnancy_test: ["pregnant","pregnancy test positive","could be pregnant"],
  vaginal_bleeding:    ["vaginal bleeding","spotting","period","abnormal bleeding"],
  productive_cough:    ["productive cough","yellow phlegm","green phlegm","sputum"],
  pleuritic_pain:      ["worse with breathing","sharp on inhale","pleuritic"],
  duration_3_days:     ["3 days","three days","for 3"],
  duration_7_days:     ["week","7 days","seven days","for a week"],
  recent_immobility:   ["long flight","bed rest","immobile","didn't move","sitting for hours"],
  unilateral_leg_swelling: ["leg swelling","one leg swollen","swollen calf"],
};

const REQUIRED_PER_COMPLAINT: Record<string, string[]> = {
  chest_pain:     ["Is the pain pressure-like or sharp?","Does it radiate to your arm or jaw?"],
  sore_throat:    ["Do you have a fever?","Are there white patches on your throat?"],
  cough:          ["How long have you had the cough?","Is it producing phlegm?"],
  abdominal_pain: ["Where exactly is the pain?","Do you have fever or nausea?"],
  fever:          ["How high is the temperature?","Do you have a stiff neck or rash?"],
  uti:            ["Do you have pain with urination?","Do you have fever or back pain?"],
  headache:       ["Is this the worst headache of your life?","Did it start suddenly?"],
  rash:           ["Is the rash spreading?","Do you have fever?"],
  dizziness:      ["Is the room spinning or are you lightheaded?","Do you have hearing loss?"],
  default:        ["Can you describe your symptoms in more detail?"],
};

export function runExtractionConfidence(
  rawText: string,
  patientAge?: number,
  patientSex?: string
): ExtractionResult {
  const lower = rawText.toLowerCase();
  const log: string[] = [];

  let bestComplaint = "unknown";
  let bestComplaintScore = 0;
  let complaintsFound = 0;

  for (const [complaint, keywords] of Object.entries(COMPLAINT_KEYWORDS)) {
    const matchCount = keywords.filter(k => lower.includes(k)).length;
    if (matchCount > 0) complaintsFound++;
    if (matchCount > bestComplaintScore) {
      bestComplaintScore = matchCount;
      bestComplaint = complaint;
    }
  }

  const extractedFeatures: string[] = [];
  for (const [feature, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) extractedFeatures.push(feature);
  }

  const hasComplaint    = bestComplaint !== "unknown" && bestComplaintScore >= 1;
  const hasEnoughSymptoms = extractedFeatures.length >= 1;
  const hasAge          = patientAge !== undefined && patientAge > 0;
  const hasSex          = !!patientSex;

  let confidence = 0;
  if (hasComplaint)       { confidence += 0.40; log.push(`+0.40 complaint identified: ${bestComplaint} (${bestComplaintScore} matches)`); }
  else                    { log.push(`+0.00 complaint not identified`); }
  if (hasEnoughSymptoms)  { confidence += Math.min(0.30, extractedFeatures.length * 0.10); log.push(`+${Math.min(0.30, extractedFeatures.length * 0.10).toFixed(2)} ${extractedFeatures.length} features extracted`); }
  else                    { log.push(`+0.00 no features extracted`); }
  if (hasAge)             { confidence += 0.15; log.push(`+0.15 age known: ${patientAge}`); }
  else                    { log.push(`+0.00 age missing`); }
  if (hasSex)             { confidence += 0.15; log.push(`+0.15 sex known: ${patientSex}`); }
  else                    { log.push(`+0.00 sex missing`); }

  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  const missingFields: string[] = [];
  if (!hasComplaint)      missingFields.push("complaint");
  if (!hasEnoughSymptoms) missingFields.push("symptoms");
  if (!hasAge)            missingFields.push("age");
  if (!hasSex)            missingFields.push("sex");

  const canProceed = hasComplaint && hasEnoughSymptoms;

  const blockReason = !canProceed
    ? !hasComplaint
      ? "Unable to identify a chief complaint from your description."
      : "Too little symptom information to run triage safely."
    : "";

  const questionBank = REQUIRED_PER_COMPLAINT[bestComplaint] ?? REQUIRED_PER_COMPLAINT.default;
  const nextQuestion = canProceed
    ? (missingFields.includes("age") ? "How old are you?" : missingFields.includes("sex") ? "What is your biological sex?" : questionBank[0])
    : (!hasComplaint ? "What is your main health concern today?" : questionBank[0]);

  return {
    complaint: bestComplaint,
    features: extractedFeatures,
    complaintsFound,
    featuresFound: extractedFeatures.length,
    confidence,
    missingFields,
    canProceed,
    blockReason,
    nextQuestion,
    extractionLog: log,
  };
}
