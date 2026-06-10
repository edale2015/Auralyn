/**
 * Patient Response Simulator
 *
 * Generates realistic patient conversation responses modelled on
 * MedDialog (medDialog.org) and HealthCareMagic100k dataset patterns.
 *
 * Three clinical personas:
 *   high_risk  — older, multiple comorbidities, classic high-risk presentation
 *   moderate   — middle-aged, some risk factors, partially symptomatic
 *   low_risk   — young, no PMH, benign presentation
 *
 * Pattern design:
 *   - Patients speak in natural everyday language (not clinical terms)
 *   - Imprecise time references ("a few days ago", "earlier today")
 *   - Common qualifiers ("I think", "I'm not sure, but", "actually yes")
 *   - Boolean answers are "yes / no" + short elaboration
 */

export type Scenario = "high_risk" | "moderate" | "low_risk";

export interface PatientPersona {
  age: number;
  sex: "male" | "female";
  smoker: boolean;
  pmh: string[];
  meds: string[];
  bmi: string;
}

export interface SimulatedAnswer {
  ruleId:       string;
  questionText: string;
  answer:       "yes" | "no" | "value";
  response:     string;
  populateDeps: boolean;
  level:        1 | 2 | 3;
  deps:         string[];
}

export const PERSONAS: Record<Scenario, PatientPersona> = {
  high_risk: {
    age:    67,
    sex:    "male",
    smoker: true,
    pmh:    ["hypertension", "type 2 diabetes", "hyperlipidemia", "CAD"],
    meds:   ["aspirin", "metformin", "lisinopril", "atorvastatin", "metoprolol"],
    bmi:    "obese",
  },
  moderate: {
    age:    48,
    sex:    "female",
    smoker: false,
    pmh:    ["hypertension", "anxiety"],
    meds:   ["amlodipine", "sertraline"],
    bmi:    "overweight",
  },
  low_risk: {
    age:    26,
    sex:    "female",
    smoker: false,
    pmh:    [],
    meds:   [],
    bmi:    "normal",
  },
};

// ── Question-type classifier ─────────────────────────────────────────────────

type QuestionType =
  | "onset"       | "duration"    | "character"   | "severity"
  | "radiation"   | "location"    | "trigger"     | "relief"
  | "associated"  | "fever"       | "shortness"   | "nausea"
  | "syncope"     | "pmh"         | "medication"  | "social"
  | "boolean"     | "open";

function classifyQuestion(text: string): QuestionType {
  const t = text.toLowerCase();
  if (/sudden|start|when did|how long|begin|onset/i.test(t))     return "onset";
  if (/how long|duration|days|hours|weeks|since/i.test(t))        return "duration";
  if (/feel like|character|sharp|dull|pressure|burning|tearing|stabbing|squeezing/i.test(t)) return "character";
  if (/pain.*scale|rate.*pain|severe|intensity|1.*10|0.*10/i.test(t)) return "severity";
  if (/spread|radiat|arm|jaw|back|shoulder.*pain|neck.*pain/i.test(t)) return "radiation";
  if (/where.*pain|location|point to|area/i.test(t))             return "location";
  if (/worse|trigger|bring on|aggravat|exertion|activity|eating|movement|deep breath/i.test(t)) return "trigger";
  if (/better|relief|improve|antacid|nitroglycerin|rest|position/i.test(t)) return "relief";
  if (/fever|temperature|chills|hot/i.test(t))                   return "fever";
  if (/breath|breathing|shortness|sob|wheez|oxygen/i.test(t))    return "shortness";
  if (/nausea|vomit|sick to|queasy/i.test(t))                    return "nausea";
  if (/faint|dizziness|syncope|pass out|black out|lightheaded/i.test(t)) return "syncope";
  if (/sweat|diaphor|diaphoresis|clam|perspir/i.test(t))         return "associated";
  if (/medical hist|conditions|diagnosis|diagnos|hiv|hepatitis|diabetes|hypertension|prior|history of/i.test(t)) return "pmh";
  if (/medication|med |drugs |taking|prescription|aspirin|ibuprofen/i.test(t)) return "medication";
  if (/smok|alcohol|drink|drug use|recreational/i.test(t))       return "social";
  if (/have you|do you|is there|are you|did you/i.test(t))       return "boolean";
  return "open";
}

// ── Response templates (MedDialog / HealthCareMagic100k patterns) ────────────

const RESPONSES: Record<QuestionType, Record<Scenario, { yes: string; no: string; value?: string }>> = {
  onset: {
    high_risk: {
      yes:   "It came on suddenly about two hours ago, completely out of nowhere.",
      no:    "Honestly I'm not sure exactly when it started.",
      value: "Started suddenly about two hours ago.",
    },
    moderate: {
      yes:   "It started gradually earlier today, maybe three or four hours ago.",
      no:    "I noticed it yesterday but wasn't sure if it was serious.",
      value: "Started earlier today, a few hours ago.",
    },
    low_risk: {
      yes:   "It started maybe a day or two ago, nothing dramatic.",
      no:    "I've had it off and on for a week or so.",
      value: "Started a couple days ago.",
    },
  },
  duration: {
    high_risk: {
      yes:   "It's been going on for about two hours continuously.",
      no:    "It's been constant since it started.",
      value: "About two hours, constant the whole time.",
    },
    moderate: {
      yes:   "On and off for the past 24 hours.",
      no:    "It comes and goes, maybe 20-30 minutes at a time.",
      value: "On and off since yesterday.",
    },
    low_risk: {
      yes:   "Just today, it's been mild.",
      no:    "Off and on for a few days.",
      value: "Started a few days ago.",
    },
  },
  character: {
    high_risk: {
      yes:   "It feels like a heavy pressure, like someone is sitting on my chest — very squeezing.",
      no:    "More like a burning sensation, actually.",
      value: "Crushing pressure, like an elephant on my chest.",
    },
    moderate: {
      yes:   "It's kind of sharp, comes and goes. Not constant but pretty uncomfortable.",
      no:    "More of a dull aching feeling honestly.",
      value: "Sharp-ish, comes and goes.",
    },
    low_risk: {
      yes:   "Just a mild ache, nothing terrible.",
      no:    "It's hard to describe — kind of tight but not really painful.",
      value: "Mild ache.",
    },
  },
  severity: {
    high_risk: {
      yes:   "I'd say about an 8 out of 10 — it's the worst pain I've had in years.",
      no:    "Maybe a 7, it's really bothering me.",
      value: "8 out of 10.",
    },
    moderate: {
      yes:   "Probably a 5 or 6. Uncomfortable enough that I can't ignore it.",
      no:    "Around a 4 or 5.",
      value: "5 out of 10.",
    },
    low_risk: {
      yes:   "Maybe a 2 or 3. It's annoying but not really that bad.",
      no:    "A 2, it's pretty mild.",
      value: "2 or 3 out of 10.",
    },
  },
  radiation: {
    high_risk: {
      yes:   "Yes, actually — it goes down my left arm and I feel it in my jaw too.",
      no:    "No radiation that I can feel.",
      value: "Radiates to left arm and jaw.",
    },
    moderate: {
      yes:   "It does seem to go to my left shoulder a bit.",
      no:    "No, stays in one place.",
      value: "Slight radiation to left shoulder.",
    },
    low_risk: {
      yes:   "No, it stays where it is.",
      no:    "No, just in one spot.",
      value: "No radiation.",
    },
  },
  location: {
    high_risk: {
      yes:   "It's right in the middle of my chest, more on the left side.",
      no:    "Hard to pinpoint, kind of diffuse.",
      value: "Central chest, left-sided.",
    },
    moderate: {
      yes:   "In my chest, sort of in the center.",
      no:    "It moves around a bit honestly.",
      value: "Center of chest.",
    },
    low_risk: {
      yes:   "More like the left side, lower part of my chest.",
      no:    "I'm not exactly sure where.",
      value: "Left lower chest.",
    },
  },
  trigger: {
    high_risk: {
      yes:   "Yes, it gets much worse with any activity — even walking to the bathroom.",
      no:    "It's present even at rest, actually.",
      value: "Worse with exertion.",
    },
    moderate: {
      yes:   "It does seem worse when I move around or take a deep breath.",
      no:    "No specific trigger I can identify.",
      value: "Worse with movement and deep breathing.",
    },
    low_risk: {
      yes:   "Maybe a little worse after eating.",
      no:    "No, it doesn't really change with anything.",
      value: "Slightly worse after eating.",
    },
  },
  relief: {
    high_risk: {
      yes:   "Nothing seems to help — lying down doesn't change it.",
      no:    "I tried an antacid and it didn't do anything.",
      value: "Nothing relieves it.",
    },
    moderate: {
      yes:   "It seemed slightly better when I sat forward.",
      no:    "Not really, I tried ibuprofen and it helped a little.",
      value: "Slightly better sitting forward.",
    },
    low_risk: {
      yes:   "It gets better when I rest.",
      no:    "Ibuprofen mostly took care of it.",
      value: "Better with rest and ibuprofen.",
    },
  },
  fever: {
    high_risk: {
      yes:   "No fever that I know of, I haven't checked my temperature.",
      no:    "No chills or fever.",
      value: "No fever.",
    },
    moderate: {
      yes:   "I might have a low-grade fever, felt a little warm earlier.",
      no:    "No fever.",
      value: "Possible low-grade fever.",
    },
    low_risk: {
      yes:   "No fever, temperature was normal when I checked.",
      no:    "No, no fever.",
      value: "No fever.",
    },
  },
  shortness: {
    high_risk: {
      yes:   "Yes, I'm very short of breath — even sitting still right now.",
      no:    "Yes, it's hard to breathe normally.",
      value: "Shortness of breath at rest.",
    },
    moderate: {
      yes:   "A little shortness of breath, mostly when I exert myself.",
      no:    "Mild shortness of breath with activity.",
      value: "Mild exertional dyspnea.",
    },
    low_risk: {
      yes:   "No shortness of breath.",
      no:    "No, breathing is fine.",
      value: "No shortness of breath.",
    },
  },
  nausea: {
    high_risk: {
      yes:   "Yes, I feel very nauseous and I vomited once about an hour ago.",
      no:    "I feel nauseous but haven't vomited.",
      value: "Nausea with one episode of vomiting.",
    },
    moderate: {
      yes:   "Some mild nausea, yes.",
      no:    "A little queasy but no vomiting.",
      value: "Mild nausea.",
    },
    low_risk: {
      yes:   "No nausea at all.",
      no:    "No, stomach feels fine.",
      value: "No nausea.",
    },
  },
  syncope: {
    high_risk: {
      yes:   "I felt very lightheaded and nearly passed out right when it started.",
      no:    "I'm dizzy and my vision went grey for a second.",
      value: "Near-syncope at onset.",
    },
    moderate: {
      yes:   "A little lightheaded, yes.",
      no:    "Some dizziness when I stand up.",
      value: "Mild lightheadedness.",
    },
    low_risk: {
      yes:   "No dizziness or lightheadedness.",
      no:    "No, I feel fine otherwise.",
      value: "No dizziness.",
    },
  },
  associated: {
    high_risk: {
      yes:   "Yes, I'm sweating profusely — I'm drenched right now.",
      no:    "I'm sweating quite a bit.",
      value: "Diaphoresis present.",
    },
    moderate: {
      yes:   "I did notice I was sweating more than usual.",
      no:    "Mild sweating.",
      value: "Mild diaphoresis.",
    },
    low_risk: {
      yes:   "No excessive sweating.",
      no:    "No, not sweating.",
      value: "No diaphoresis.",
    },
  },
  pmh: {
    high_risk: {
      yes:   "Yes — I have high blood pressure, diabetes, and high cholesterol. I had a heart stent placed 5 years ago.",
      no:    "I have hypertension and diabetes.",
      value: "HTN, T2DM, hyperlipidemia, prior CAD with stent.",
    },
    moderate: {
      yes:   "I have high blood pressure, been on medication for it for a few years.",
      no:    "Just hypertension, nothing else.",
      value: "Hypertension on medication.",
    },
    low_risk: {
      yes:   "No, I'm generally healthy, no chronic conditions.",
      no:    "No medical history.",
      value: "No significant PMH.",
    },
  },
  medication: {
    high_risk: {
      yes:   "I take aspirin, metformin, lisinopril, a statin, and metoprolol daily.",
      no:    "Several medications — aspirin, blood pressure pill, metformin.",
      value: "Aspirin, metformin, lisinopril, atorvastatin, metoprolol.",
    },
    moderate: {
      yes:   "I take amlodipine for blood pressure and sertraline.",
      no:    "Amlodipine and sertraline.",
      value: "Amlodipine, sertraline.",
    },
    low_risk: {
      yes:   "No prescription medications, just an occasional ibuprofen.",
      no:    "No medications.",
      value: "None.",
    },
  },
  social: {
    high_risk: {
      yes:   "I've smoked about a pack a day for 40 years. I drink socially, no recreational drugs.",
      no:    "I'm a smoker, have been for decades.",
      value: "40 pack-year smoking history. Social alcohol.",
    },
    moderate: {
      yes:   "I don't smoke. I have a glass of wine occasionally.",
      no:    "Non-smoker, social drinker.",
      value: "Non-smoker. Occasional alcohol.",
    },
    low_risk: {
      yes:   "Non-smoker, occasional alcohol on weekends, no drugs.",
      no:    "Non-smoker, non-drinker.",
      value: "Non-smoker. Rare alcohol.",
    },
  },
  boolean: {
    high_risk: {
      yes:   "Yes, definitely.",
      no:    "Yes, I would say so.",
      value: "Yes.",
    },
    moderate: {
      yes:   "I think so, yes.",
      no:    "Not really, no.",
      value: "Yes, somewhat.",
    },
    low_risk: {
      yes:   "No, I don't think so.",
      no:    "No.",
      value: "No.",
    },
  },
  open: {
    high_risk: {
      yes:   "I feel terrible — this is really scaring me.",
      no:    "Not much else to add, just that it's pretty bad.",
      value: "Feels very concerning.",
    },
    moderate: {
      yes:   "It's been on my mind, didn't want to come in but my family insisted.",
      no:    "I thought it would pass but it hasn't.",
      value: "Concerning enough to come in.",
    },
    low_risk: {
      yes:   "It's not a big deal, just wanted to make sure it's nothing serious.",
      no:    "Probably nothing, just checking.",
      value: "Mild, just checking.",
    },
  },
};

// ── Core simulator ───────────────────────────────────────────────────────────

/**
 * For a given scenario, determine if a question's "yes" answer should be
 * triggered.  High-risk = most questions → yes, low-risk = most → no.
 * Priority 1-3 (HPI) always respected; secondary/modifying are scenario-gated.
 */
function shouldAnswerYes(
  scenario: Scenario,
  questionType: QuestionType,
  priority: number,
  safetyLevel: string,
): boolean {
  const typicallyYesForAllScenarios: QuestionType[] = ["onset", "duration", "character", "location", "severity", "medication", "social", "pmh"];

  // PMH and meds: high/moderate yes, low no
  if (["pmh", "medication"].includes(questionType)) {
    return scenario !== "low_risk";
  }
  // Social: high yes, others no
  if (questionType === "social") {
    return scenario === "high_risk";
  }
  // Onset/duration/character/location/severity always get a value
  if (typicallyYesForAllScenarios.includes(questionType)) {
    return true;
  }
  // Critical/safety flags: high always yes
  if (safetyLevel === "CRITICAL" || safetyLevel === "HIGH") {
    if (scenario === "high_risk") return true;
    if (scenario === "moderate") return priority <= 4;
    return false;
  }
  // Standard boolean symptom questions
  if (scenario === "high_risk") return priority <= 8;  // most yes
  if (scenario === "moderate")  return priority <= 4;  // about half
  return priority <= 2;                                // very few
}

export interface QuestionRule {
  rule_id:               string;
  rule_name:             string;
  logic_description:     string | null;
  question_dependencies: string | string[] | null;
  safety_level:          string;
  priority:              number;
  complaint_id:          string;
}

export function simulateAnswers(
  questions: QuestionRule[],
  scenario: Scenario,
  customAnswers?: Record<string, string>,
): SimulatedAnswer[] {
  const answers: SimulatedAnswer[] = [];

  for (const q of questions) {
    const qText      = q.logic_description ?? q.rule_name ?? "";
    const qType      = classifyQuestion(qText);
    const deps       = parseDeps(q.question_dependencies);
    const custom     = customAnswers?.[q.rule_id];
    const level      = q.priority <= 3 ? 1 : q.priority <= 6 ? 2 : 3;

    let populateDeps: boolean;
    let answer: "yes" | "no" | "value";
    let response: string;

    if (custom !== undefined) {
      // User override
      const isYes = /^y(es)?$/i.test(custom.trim());
      const isNo  = /^no?$/i.test(custom.trim());
      populateDeps = isYes;
      answer       = isYes ? "yes" : isNo ? "no" : "value";
      response     = custom;
    } else {
      populateDeps = shouldAnswerYes(scenario, qType, q.priority, q.safety_level);
      answer       = populateDeps ? "yes" : "no";
      const bank   = RESPONSES[qType]?.[scenario] ?? RESPONSES.boolean[scenario];
      response     = populateDeps ? bank.yes : bank.no;
    }

    answers.push({
      ruleId:       q.rule_id,
      questionText: qText,
      answer,
      response,
      populateDeps,
      level:        level as 1 | 2 | 3,
      deps,
    });
  }

  return answers;
}

export function buildPipelineInputs(
  answers: SimulatedAnswer[],
): Record<string, boolean | string | number> {
  const inputs: Record<string, boolean | string | number> = {};
  for (const a of answers) {
    for (const dep of a.deps) {
      inputs[dep] = a.populateDeps;
    }
  }
  return inputs;
}

function parseDeps(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    return s.slice(1, -1).split(",").map(f => f.trim()).filter(Boolean);
  }
  return s ? s.split(/[\s,]+/).map(f => f.trim()).filter(Boolean) : [];
}

// ── Medical system taxonomy ──────────────────────────────────────────────────

export const MEDICAL_SYSTEMS: Array<{ key: string; label: string; color: string }> = [
  { key: "cardiovascular",  label: "Cardiovascular",          color: "red"     },
  { key: "dermatology",     label: "Dermatology",             color: "amber"   },
  { key: "ent",             label: "Ear, Nose & Throat",      color: "yellow"  },
  { key: "endocrine",       label: "Endocrine & Metabolic",   color: "orange"  },
  { key: "gastrointestinal",label: "Gastrointestinal",        color: "green"   },
  { key: "general",         label: "General & Systemic",      color: "slate"   },
  { key: "genitourinary",   label: "Genitourinary & Gyn",     color: "pink"    },
  { key: "infectious",      label: "Infectious Disease",      color: "lime"    },
  { key: "musculoskeletal", label: "Musculoskeletal",         color: "cyan"    },
  { key: "neurological",    label: "Neurological",            color: "purple"  },
  { key: "ophthalmology",   label: "Ophthalmology",           color: "sky"     },
  { key: "psychiatry",      label: "Psychiatry & Behavioral", color: "violet"  },
  { key: "respiratory",     label: "Respiratory / Pulmonary", color: "blue"    },
  { key: "toxicology",      label: "Toxicology",              color: "rose"    },
];

export function classifyComplaint(id: string): string {
  const s = id.toLowerCase();
  if (/^cardio|cardiac|chest_pain|palpitat|arrhyth|afib|svt|chf|aorta|valve|coronar|angina|mi_|acs_|stemi|nstemi|heart_/.test(s)) return "cardiovascular";
  if (/^derm|^skin_|^rash|eczema|psoriasis|acne|wound_|ulcer|cellulitis|hair_|nail_|chronic_rash|hives|urticaria/.test(s))         return "dermatology";
  if (/^ent_|^sore_throat|^throat|^ear_|hearing|sinusitis|^sinus|nasal|epistaxis|hoarseness|tonsil|^dental/.test(s))              return "ent";
  if (/^endo|diabet|thyroid|adrenal|hypoglycemia|hyperglycemia|^obesity|^weight_|metabolic|insulin|glucose/.test(s))               return "endocrine";
  if (/^gi_|^abdominal|^nausea|^vomiting|constipation|diarrhea|^bowel|rectal|hepatic|^liver|gallbladder|pancreat|dysphagia|gerd|colitis|appendicitis|gastro/.test(s)) return "gastrointestinal";
  if (/^gu_|^urology|^urogyn|^uti|^kidney|^renal|flank_pain|vaginal|testicular|prostat|erectile|menstrual|pelvic|^gyn_|pregnan|obstetric/.test(s)) return "genitourinary";
  if (/^neuro|^headache|dizziness|vertigo|seizure|stroke|^tia_|neuropath|dementia|confusion|syncope|tremor|cognitiv|memory|^weakness/.test(s)) return "neurological";
  if (/^msk_|^ortho|back_pain|^joint|^shoulder|^hip|^knee|^ankle|^wrist|^elbow|^foot_|^hand_pain|neck_pain|^spine|fracture|arthritis|tendon|ligament/.test(s)) return "musculoskeletal";
  if (/^ophtho|^eye_|^vision|retinal|glaucoma|cataract|conjunctivitis|red_eye/.test(s))                                           return "ophthalmology";
  if (/^psych|anxiety|depression|panic|ptsd|schizophrenia|bipolar|insomnia|eating_disorder|suicid|mania|^substance_use/.test(s))   return "psychiatry";
  if (/^pulm|^cough|dyspnea|shortness_of_breath|pneumonia|asthma|^copd|bronchitis|pleural|pulmonary|^persistent_cough|^resp_/.test(s)) return "respiratory";
  if (/^tox_|overdose|poisoning|^intoxication|withdrawal|substance_abuse/.test(s))                                                return "toxicology";
  if (/^id_|^fever|^infection|sepsis|covid|influenza|viral_|bacterial|parasitic|tropical|^hiv|^std_|infectious|childhood_fever/.test(s)) return "infectious";
  return "general";
}
