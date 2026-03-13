interface DynamicQuestion {
  id: string
  text: string
  purpose: string
  targetFeature: string
}

interface QuestionGapResult {
  questions: DynamicQuestion[]
  coveredFeatures: string[]
  missingFeatures: string[]
}

const COMPLAINT_FEATURES: Record<string, Array<{
  feature: string
  keywords: string[]
  question: DynamicQuestion
}>> = {
  cough: [
    {
      feature: "shortness_of_breath",
      keywords: ["shortness", "sob", "breathless", "dyspnea"],
      question: { id: "cough_sob", text: "Any shortness of breath or difficulty breathing?", purpose: "Distinguish bronchitis from pneumonia", targetFeature: "shortness_of_breath" },
    },
    {
      feature: "chest_pain",
      keywords: ["chest pain", "chest hurt", "pleuritic"],
      question: { id: "cough_chest", text: "Any chest pain when you cough or breathe deeply?", purpose: "Pleuritic pain suggests pneumonia or PE", targetFeature: "chest_pain" },
    },
    {
      feature: "sputum_color",
      keywords: ["green", "yellow", "blood", "clear", "white", "productive", "phlegm"],
      question: { id: "cough_sputum", text: "Are you coughing anything up? If so, what color?", purpose: "Purulent sputum suggests bacterial infection", targetFeature: "sputum_color" },
    },
    {
      feature: "duration",
      keywords: ["days", "weeks", "month", "since"],
      question: { id: "cough_duration", text: "How long have you had this cough?", purpose: ">3 weeks raises concern for pertussis or malignancy", targetFeature: "duration" },
    },
    {
      feature: "fever",
      keywords: ["fever", "temperature", "chills"],
      question: { id: "cough_fever", text: "Do you have a fever or chills?", purpose: "Fever raises concern for infection", targetFeature: "fever" },
    },
  ],

  sore_throat: [
    {
      feature: "fever",
      keywords: ["fever", "temperature", "chills"],
      question: { id: "st_fever", text: "Do you have a fever?", purpose: "Fever is a Centor criterion for strep", targetFeature: "fever" },
    },
    {
      feature: "exudate",
      keywords: ["white patches", "pus", "exudate", "white spots"],
      question: { id: "st_exudate", text: "Do you see any white patches or pus on your tonsils?", purpose: "Tonsillar exudate is a Centor criterion", targetFeature: "exudate" },
    },
    {
      feature: "cough_absent",
      keywords: ["no cough", "without cough"],
      question: { id: "st_cough", text: "Do you have a cough along with the sore throat?", purpose: "Absence of cough is a Centor criterion for strep", targetFeature: "cough_absent" },
    },
    {
      feature: "lymph_nodes",
      keywords: ["swollen glands", "lymph nodes", "neck lumps"],
      question: { id: "st_nodes", text: "Do you have any swollen lymph nodes in your neck?", purpose: "Anterior cervical LAD is a Centor criterion", targetFeature: "lymph_nodes" },
    },
    {
      feature: "trismus",
      keywords: ["jaw", "trismus", "open mouth", "deviated"],
      question: { id: "st_trismus", text: "Any difficulty opening your mouth or does your uvula appear shifted?", purpose: "Trismus / uvular deviation → peritonsillar abscess", targetFeature: "trismus" },
    },
  ],

  headache: [
    {
      feature: "severity",
      keywords: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "scale", "severe", "mild", "moderate"],
      question: { id: "ha_severity", text: "On a scale of 1–10, how severe is the headache right now?", purpose: "Severity guides triage urgency", targetFeature: "severity" },
    },
    {
      feature: "onset",
      keywords: ["sudden", "gradual", "slowly", "instantly", "came on", "started"],
      question: { id: "ha_onset", text: "Did this headache come on suddenly or gradually?", purpose: "Thunderclap onset suggests SAH", targetFeature: "onset" },
    },
    {
      feature: "stiff_neck",
      keywords: ["stiff neck", "neck stiff", "cannot bend", "meningismus"],
      question: { id: "ha_neck", text: "Do you have neck stiffness or pain when moving your neck?", purpose: "Meningismus → meningitis/SAH", targetFeature: "stiff_neck" },
    },
    {
      feature: "photophobia",
      keywords: ["light", "photophobia", "bright", "sensitive"],
      question: { id: "ha_photo", text: "Are you sensitive to light or sound?", purpose: "Photophobia/phonophobia → migraine or meningitis", targetFeature: "photophobia" },
    },
    {
      feature: "aura",
      keywords: ["aura", "visual", "zigzag", "blind spot", "flashing"],
      question: { id: "ha_aura", text: "Do you see any visual disturbances before or during the headache?", purpose: "Aura is characteristic of migraine", targetFeature: "aura" },
    },
    {
      feature: "prior_headache",
      keywords: ["before", "usual", "same", "history", "prior", "before"],
      question: { id: "ha_prior", text: "Have you had headaches like this before, or is this different from your usual headaches?", purpose: "New type of headache is a red flag", targetFeature: "prior_headache" },
    },
  ],

  fever: [
    {
      feature: "temperature",
      keywords: ["temperature", "degrees", "fahrenheit", "celsius", "thermometer"],
      question: { id: "fv_temp", text: "Did you measure your temperature? If so, what was it?", purpose: "Quantifies fever severity", targetFeature: "temperature" },
    },
    {
      feature: "localizing_symptoms",
      keywords: ["cough", "sore throat", "dysuria", "pain", "rash"],
      question: { id: "fv_local", text: "Do you have any other symptoms pointing to a specific area — like cough, sore throat, urinary pain, or rash?", purpose: "Localizes source of infection", targetFeature: "localizing_symptoms" },
    },
    {
      feature: "rigors",
      keywords: ["shaking", "chills", "rigors", "shivering"],
      question: { id: "fv_rigors", text: "Any shaking chills or rigors (uncontrollable shivering)?", purpose: "Rigors suggest bacteremia", targetFeature: "rigors" },
    },
    {
      feature: "duration",
      keywords: ["days", "weeks", "started", "since"],
      question: { id: "fv_duration", text: "How many days have you had the fever?", purpose: ">5 days fever warrants further evaluation", targetFeature: "duration" },
    },
  ],

  abdominal_pain: [
    {
      feature: "location",
      keywords: ["right lower", "left lower", "upper", "right upper", "left upper", "periumbilical", "generalized"],
      question: { id: "ab_location", text: "Where exactly is the pain — can you point to it? (right lower, upper right, central, etc.)", purpose: "Location is the most important localizing feature", targetFeature: "location" },
    },
    {
      feature: "severity",
      keywords: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "severe", "mild"],
      question: { id: "ab_severity", text: "On a scale of 1–10, how severe is the pain?", purpose: "High severity raises concern for surgical abdomen", targetFeature: "severity" },
    },
    {
      feature: "onset",
      keywords: ["sudden", "gradual", "hours", "days"],
      question: { id: "ab_onset", text: "Did the pain come on suddenly or gradually?", purpose: "Sudden onset suggests perforation or ischemia", targetFeature: "onset" },
    },
    {
      feature: "bowel_changes",
      keywords: ["diarrhea", "constipation", "bloody stool", "vomiting", "nausea"],
      question: { id: "ab_bowel", text: "Any nausea, vomiting, diarrhea, or changes in stool?", purpose: "GI symptoms suggest gastroenteritis vs surgical cause", targetFeature: "bowel_changes" },
    },
    {
      feature: "fever",
      keywords: ["fever", "temperature", "chills"],
      question: { id: "ab_fever", text: "Do you have a fever?", purpose: "Fever + abdominal pain → appendicitis, cholecystitis, pyelonephritis", targetFeature: "fever" },
    },
  ],

  chest_pain: [
    {
      feature: "character",
      keywords: ["crushing", "pressure", "stabbing", "sharp", "burning", "squeezing", "tightness"],
      question: { id: "cp_character", text: "How would you describe the pain — crushing/pressure, sharp/stabbing, or burning?", purpose: "Character differentiates ACS from MSK/GERD", targetFeature: "character" },
    },
    {
      feature: "radiation",
      keywords: ["arm", "jaw", "back", "shoulder", "radiating", "spreading"],
      question: { id: "cp_radiation", text: "Does the pain radiate to your arm, jaw, or back?", purpose: "Radiation to arm/jaw is classic for ACS", targetFeature: "radiation" },
    },
    {
      feature: "dyspnea",
      keywords: ["shortness", "breathless", "dyspnea", "breathing"],
      question: { id: "cp_sob", text: "Any shortness of breath with the chest pain?", purpose: "Dyspnea + chest pain raises PE and ACS concern", targetFeature: "dyspnea" },
    },
    {
      feature: "cardiac_history",
      keywords: ["heart attack", "cardiac", "stent", "bypass", "catheterization"],
      question: { id: "cp_hx", text: "Any history of heart attack, stents, or cardiac procedures?", purpose: "Prior cardiac history significantly raises ACS probability", targetFeature: "cardiac_history" },
    },
    {
      feature: "risk_factors",
      keywords: ["diabetes", "hypertension", "cholesterol", "smoking", "family"],
      question: { id: "cp_risk", text: "Do you have diabetes, high blood pressure, high cholesterol, or a family history of heart disease?", purpose: "Risk factor loading for ACS pre-test probability", targetFeature: "risk_factors" },
    },
  ],

  dizziness: [
    {
      feature: "character",
      keywords: ["spinning", "lightheaded", "unsteady", "floating", "vertigo"],
      question: { id: "dz_char", text: "Is it a spinning sensation (vertigo) or more lightheadedness/faintness?", purpose: "True vertigo vs presyncope changes DDx completely", targetFeature: "character" },
    },
    {
      feature: "positional",
      keywords: ["position", "turning", "lying down", "standing", "rolling"],
      question: { id: "dz_pos", text: "Does it happen with specific head movements or position changes?", purpose: "Positional → BPPV", targetFeature: "positional" },
    },
    {
      feature: "hearing",
      keywords: ["hearing loss", "tinnitus", "ringing", "muffled"],
      question: { id: "dz_hearing", text: "Any hearing loss or ringing in the ears?", purpose: "Hearing symptoms → Meniere's vs vestibular neuritis", targetFeature: "hearing" },
    },
    {
      feature: "neurological",
      keywords: ["double vision", "slurred", "weakness", "numbness", "facial droop"],
      question: { id: "dz_neuro", text: "Any double vision, slurred speech, weakness, or facial drooping?", purpose: "Neurological signs → central vertigo (CVA/TIA)", targetFeature: "neurological" },
    },
  ],
}

function detectCoveredFeatures(symptoms: string, complaint: string): Set<string> {
  const covered = new Set<string>()
  const lower = symptoms.toLowerCase()
  const features = COMPLAINT_FEATURES[complaint] ?? []

  for (const f of features) {
    if (f.keywords.some(kw => lower.includes(kw))) {
      covered.add(f.feature)
    }
  }
  return covered
}

export function suggestQuestions(state: {
  complaint: string
  symptoms: string
  answeredQuestions?: Array<{ questionId: string }>
  maxQuestions?: number
}): QuestionGapResult {
  const { complaint, symptoms, answeredQuestions = [], maxQuestions = 4 } = state
  const answeredIds = new Set(answeredQuestions.map(q => q.questionId))

  const features = COMPLAINT_FEATURES[complaint]
  if (!features) {
    return { questions: [], coveredFeatures: [], missingFeatures: [] }
  }

  const covered = detectCoveredFeatures(symptoms, complaint)
  const missing: string[] = []
  const questions: DynamicQuestion[] = []

  for (const f of features) {
    if (covered.has(f.feature)) continue
    if (answeredIds.has(f.question.id)) continue

    missing.push(f.feature)
    questions.push(f.question)

    if (questions.length >= maxQuestions) break
  }

  return {
    questions,
    coveredFeatures: Array.from(covered),
    missingFeatures: missing,
  }
}

export function getNextDynamicQuestion(state: {
  complaint: string
  symptoms: string
  answeredQuestions?: Array<{ questionId: string }>
}): DynamicQuestion | null {
  const result = suggestQuestions({ ...state, maxQuestions: 1 })
  return result.questions[0] ?? null
}
