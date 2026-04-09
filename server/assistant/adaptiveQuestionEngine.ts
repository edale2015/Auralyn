export interface AdaptiveQuestion {
  id: string;
  text: string;
  feature: string;
  expectedInfoGain: number;
  rationale: string;
  currentEntropy: number;
  entropyIfYes: number;
  entropyIfNo: number;
  pYes: number;
}

export interface AdaptiveQuestionResult {
  complaint: string;
  currentEntropy: number;
  topDiagnosis: string;
  topProbability: number;
  questions: AdaptiveQuestion[];
  differential: Array<{ diagnosis: string; probability: number }>;
}

interface DiagnosisFeatureLikelihood {
  [feature: string]: number;
}

interface ComplaintSpec {
  diagnoses: string[];
  priors: number[];
  featureLikelihoods: Record<string, DiagnosisFeatureLikelihood>;
  questionBank: Array<{ id: string; text: string; feature: string; rationale: string }>;
}

const COMPLAINT_SPECS: Record<string, ComplaintSpec> = {
  sore_throat: {
    diagnoses: ["Strep Pharyngitis", "Viral Pharyngitis", "Infectious Mononucleosis", "Peritonsillar Abscess", "Epiglottitis"],
    priors:    [0.30,               0.45,               0.12,                        0.08,                    0.05],
    featureLikelihoods: {
      fever:              { "Strep Pharyngitis": 0.75, "Viral Pharyngitis": 0.45, "Infectious Mononucleosis": 0.85, "Peritonsillar Abscess": 0.90, "Epiglottitis": 0.90 },
      exudate:            { "Strep Pharyngitis": 0.55, "Viral Pharyngitis": 0.08, "Infectious Mononucleosis": 0.50, "Peritonsillar Abscess": 0.60, "Epiglottitis": 0.05 },
      cough_absent:       { "Strep Pharyngitis": 0.65, "Viral Pharyngitis": 0.25, "Infectious Mononucleosis": 0.55, "Peritonsillar Abscess": 0.60, "Epiglottitis": 0.70 },
      swollen_lymph_nodes:{ "Strep Pharyngitis": 0.55, "Viral Pharyngitis": 0.20, "Infectious Mononucleosis": 0.90, "Peritonsillar Abscess": 0.45, "Epiglottitis": 0.20 },
      trismus:            { "Strep Pharyngitis": 0.02, "Viral Pharyngitis": 0.01, "Infectious Mononucleosis": 0.03, "Peritonsillar Abscess": 0.65, "Epiglottitis": 0.10 },
      drooling:           { "Strep Pharyngitis": 0.03, "Viral Pharyngitis": 0.02, "Infectious Mononucleosis": 0.05, "Peritonsillar Abscess": 0.35, "Epiglottitis": 0.75 },
      difficulty_swallowing:{ "Strep Pharyngitis": 0.45, "Viral Pharyngitis": 0.30, "Infectious Mononucleosis": 0.55, "Peritonsillar Abscess": 0.85, "Epiglottitis": 0.90 },
      fatigue:            { "Strep Pharyngitis": 0.40, "Viral Pharyngitis": 0.50, "Infectious Mononucleosis": 0.90, "Peritonsillar Abscess": 0.30, "Epiglottitis": 0.20 },
    },
    questionBank: [
      { id: "st_fever",   text: "Do you have a fever or have you felt feverish?", feature: "fever",               rationale: "Fever is a Centor criterion — changes strep vs viral probability" },
      { id: "st_exudate", text: "Do you see any white patches or pus on your tonsils?", feature: "exudate",       rationale: "Tonsillar exudate strongly favors strep over viral pharyngitis" },
      { id: "st_cough",   text: "Do you have a cough along with the sore throat?", feature: "cough_absent",       rationale: "Absence of cough is a Centor criterion for strep" },
      { id: "st_nodes",   text: "Are the glands in your neck swollen or tender?", feature: "swollen_lymph_nodes", rationale: "Significant adenopathy raises concern for mono vs strep" },
      { id: "st_trismus", text: "Do you have difficulty opening your mouth fully?", feature: "trismus",           rationale: "Trismus suggests peritonsillar abscess requiring drainage" },
      { id: "st_drooling",text: "Are you drooling or having trouble managing saliva?", feature: "drooling",       rationale: "Drooling is a red flag for epiglottitis" },
      { id: "st_swallow", text: "Does swallowing feel blocked or extremely painful?", feature: "difficulty_swallowing", rationale: "Severe odynophagia differentiates abscess from pharyngitis" },
      { id: "st_fatigue", text: "Have you been unusually tired or fatigued?", feature: "fatigue",                rationale: "Profound fatigue in a young patient raises concern for mono" },
    ],
  },

  cough: {
    diagnoses: ["Viral URI", "Viral Bronchitis", "Community Acquired Pneumonia", "Asthma Exacerbation", "COVID-19", "Pertussis"],
    priors:    [0.40,       0.30,             0.12,                          0.08,                0.07,      0.03],
    featureLikelihoods: {
      fever:             { "Viral URI": 0.35, "Viral Bronchitis": 0.30, "Community Acquired Pneumonia": 0.85, "Asthma Exacerbation": 0.20, "COVID-19": 0.65, "Pertussis": 0.25 },
      shortness_of_breath:{ "Viral URI": 0.10, "Viral Bronchitis": 0.20, "Community Acquired Pneumonia": 0.70, "Asthma Exacerbation": 0.90, "COVID-19": 0.50, "Pertussis": 0.25 },
      productive_cough:  { "Viral URI": 0.20, "Viral Bronchitis": 0.60, "Community Acquired Pneumonia": 0.70, "Asthma Exacerbation": 0.10, "COVID-19": 0.30, "Pertussis": 0.15 },
      chest_pain:        { "Viral URI": 0.05, "Viral Bronchitis": 0.20, "Community Acquired Pneumonia": 0.45, "Asthma Exacerbation": 0.25, "COVID-19": 0.30, "Pertussis": 0.10 },
      night_symptoms:    { "Viral URI": 0.10, "Viral Bronchitis": 0.20, "Community Acquired Pneumonia": 0.25, "Asthma Exacerbation": 0.75, "COVID-19": 0.30, "Pertussis": 0.45 },
      duration_3wk:      { "Viral URI": 0.05, "Viral Bronchitis": 0.10, "Community Acquired Pneumonia": 0.08, "Asthma Exacerbation": 0.15, "COVID-19": 0.05, "Pertussis": 0.85 },
      whoop:             { "Viral URI": 0.02, "Viral Bronchitis": 0.02, "Community Acquired Pneumonia": 0.02, "Asthma Exacerbation": 0.02, "COVID-19": 0.02, "Pertussis": 0.80 },
      loss_of_smell:     { "Viral URI": 0.15, "Viral Bronchitis": 0.05, "Community Acquired Pneumonia": 0.05, "Asthma Exacerbation": 0.02, "COVID-19": 0.65, "Pertussis": 0.02 },
    },
    questionBank: [
      { id: "co_fever",   text: "Do you have a fever or feel hot?", feature: "fever",                          rationale: "Fever separates bacterial causes (pneumonia) from viral ones" },
      { id: "co_sob",     text: "Are you short of breath or struggling to breathe at rest?", feature: "shortness_of_breath", rationale: "SOB is the key differentiator — pneumonia vs asthma vs bronchitis" },
      { id: "co_prod",    text: "Are you coughing up phlegm? If yes, what color?", feature: "productive_cough", rationale: "Productive cough shifts probability toward bacterial infection" },
      { id: "co_chest",   text: "Do you have chest pain, especially when breathing deeply?", feature: "chest_pain", rationale: "Pleuritic pain raises concern for pneumonia or pulmonary embolism" },
      { id: "co_night",   text: "Is the cough worse at night or does it wake you up?", feature: "night_symptoms", rationale: "Nocturnal cough pattern is the hallmark of asthma" },
      { id: "co_duration",text: "How long have you had this cough — more or less than 3 weeks?", feature: "duration_3wk", rationale: "Cough >3 weeks strongly raises concern for pertussis or malignancy" },
      { id: "co_whoop",   text: "Do you have episodes of forceful coughing followed by a whooping sound?", feature: "whoop", rationale: "Whooping cough is pathognomonic for pertussis" },
      { id: "co_smell",   text: "Have you lost your sense of smell or taste?", feature: "loss_of_smell",        rationale: "Anosmia is a specific marker for COVID-19" },
    ],
  },

  chest_pain: {
    diagnoses: ["Musculoskeletal Chest Pain", "Gastroesophageal Reflux", "Acute Coronary Syndrome", "Pulmonary Embolism", "Pericarditis", "Pneumothorax"],
    priors:    [0.35,                        0.25,                      0.15,                     0.10,               0.08,           0.07],
    featureLikelihoods: {
      radiation:         { "Musculoskeletal Chest Pain": 0.05, "Gastroesophageal Reflux": 0.10, "Acute Coronary Syndrome": 0.65, "Pulmonary Embolism": 0.10, "Pericarditis": 0.20, "Pneumothorax": 0.05 },
      diaphoresis:       { "Musculoskeletal Chest Pain": 0.05, "Gastroesophageal Reflux": 0.05, "Acute Coronary Syndrome": 0.60, "Pulmonary Embolism": 0.30, "Pericarditis": 0.15, "Pneumothorax": 0.15 },
      reproducible:      { "Musculoskeletal Chest Pain": 0.80, "Gastroesophageal Reflux": 0.10, "Acute Coronary Syndrome": 0.05, "Pulmonary Embolism": 0.05, "Pericarditis": 0.05, "Pneumothorax": 0.05 },
      pleuritic:         { "Musculoskeletal Chest Pain": 0.20, "Gastroesophageal Reflux": 0.05, "Acute Coronary Syndrome": 0.08, "Pulmonary Embolism": 0.70, "Pericarditis": 0.65, "Pneumothorax": 0.75 },
      worse_lying:       { "Musculoskeletal Chest Pain": 0.10, "Gastroesophageal Reflux": 0.60, "Acute Coronary Syndrome": 0.10, "Pulmonary Embolism": 0.05, "Pericarditis": 0.20, "Pneumothorax": 0.10 },
      immobilization:    { "Musculoskeletal Chest Pain": 0.05, "Gastroesophageal Reflux": 0.05, "Acute Coronary Syndrome": 0.05, "Pulmonary Embolism": 0.60, "Pericarditis": 0.05, "Pneumothorax": 0.05 },
      fever:             { "Musculoskeletal Chest Pain": 0.05, "Gastroesophageal Reflux": 0.05, "Acute Coronary Syndrome": 0.10, "Pulmonary Embolism": 0.15, "Pericarditis": 0.75, "Pneumothorax": 0.10 },
      sob:               { "Musculoskeletal Chest Pain": 0.10, "Gastroesophageal Reflux": 0.10, "Acute Coronary Syndrome": 0.55, "Pulmonary Embolism": 0.75, "Pericarditis": 0.35, "Pneumothorax": 0.70 },
    },
    questionBank: [
      { id: "cp_rad",    text: "Does the pain radiate to your arm, jaw, neck, or shoulder?", feature: "radiation",   rationale: "Radiation strongly shifts probability toward ACS" },
      { id: "cp_sweat",  text: "Are you sweating or feeling clammy?", feature: "diaphoresis",                        rationale: "Diaphoresis is an autonomic marker for ACS or massive PE" },
      { id: "cp_repro",  text: "Does pressing on your chest wall reproduce or worsen the pain?", feature: "reproducible", rationale: "Reproducibility on palpation strongly favors musculoskeletal" },
      { id: "cp_breath", text: "Does the pain get worse when you breathe in deeply?", feature: "pleuritic",          rationale: "Pleuritic pain raises concern for PE, pericarditis, or pneumothorax" },
      { id: "cp_lying",  text: "Is the pain worse when you lie flat and better when leaning forward?", feature: "worse_lying", rationale: "Positional relief when leaning forward is a key pericarditis sign" },
      { id: "cp_immob",  text: "Have you been on bed rest, a long flight, or had leg swelling recently?", feature: "immobilization", rationale: "Immobilization is a major PE risk factor" },
      { id: "cp_fever",  text: "Do you have a fever or recent viral illness?", feature: "fever",                     rationale: "Fever + chest pain raises concern for pericarditis" },
      { id: "cp_sob",    text: "Are you short of breath at rest?", feature: "sob",                                   rationale: "SOB at rest differentiates serious from benign causes" },
    ],
  },

  headache: {
    diagnoses: ["Tension Headache", "Migraine", "Subarachnoid Hemorrhage", "Meningitis", "Hypertensive Emergency", "Cluster Headache"],
    priors:    [0.40,              0.30,       0.05,                      0.07,          0.08,                      0.10],
    featureLikelihoods: {
      thunderclap:       { "Tension Headache": 0.02, "Migraine": 0.05, "Subarachnoid Hemorrhage": 0.90, "Meningitis": 0.30, "Hypertensive Emergency": 0.25, "Cluster Headache": 0.10 },
      neck_stiffness:    { "Tension Headache": 0.10, "Migraine": 0.05, "Subarachnoid Hemorrhage": 0.60, "Meningitis": 0.85, "Hypertensive Emergency": 0.15, "Cluster Headache": 0.05 },
      photophobia:       { "Tension Headache": 0.15, "Migraine": 0.90, "Subarachnoid Hemorrhage": 0.60, "Meningitis": 0.75, "Hypertensive Emergency": 0.20, "Cluster Headache": 0.30 },
      nausea_vomiting:   { "Tension Headache": 0.10, "Migraine": 0.80, "Subarachnoid Hemorrhage": 0.55, "Meningitis": 0.65, "Hypertensive Emergency": 0.30, "Cluster Headache": 0.50 },
      eye_pain:          { "Tension Headache": 0.05, "Migraine": 0.15, "Subarachnoid Hemorrhage": 0.20, "Meningitis": 0.10, "Hypertensive Emergency": 0.10, "Cluster Headache": 0.90 },
      aura:              { "Tension Headache": 0.05, "Migraine": 0.30, "Subarachnoid Hemorrhage": 0.10, "Meningitis": 0.05, "Hypertensive Emergency": 0.05, "Cluster Headache": 0.05 },
      fever:             { "Tension Headache": 0.05, "Migraine": 0.05, "Subarachnoid Hemorrhage": 0.15, "Meningitis": 0.90, "Hypertensive Emergency": 0.10, "Cluster Headache": 0.05 },
      vision_changes:    { "Tension Headache": 0.05, "Migraine": 0.25, "Subarachnoid Hemorrhage": 0.35, "Meningitis": 0.20, "Hypertensive Emergency": 0.55, "Cluster Headache": 0.15 },
    },
    questionBank: [
      { id: "ha_thunder", text: "Did this headache come on suddenly and reach maximum intensity within seconds or a minute?", feature: "thunderclap", rationale: "Thunderclap onset is the single most important red flag for subarachnoid hemorrhage" },
      { id: "ha_neck",    text: "Is your neck stiff or painful to flex forward?", feature: "neck_stiffness",          rationale: "Nuchal rigidity is a cardinal sign of meningitis or subarachnoid hemorrhage" },
      { id: "ha_light",   text: "Does bright light make the headache worse?", feature: "photophobia",                 rationale: "Photophobia is a key migraine feature but also occurs in meningitis" },
      { id: "ha_nausea",  text: "Do you have nausea or have you vomited?", feature: "nausea_vomiting",               rationale: "N/V pattern differentiates migraine (with aura) from tension" },
      { id: "ha_eye",     text: "Do you have severe pain around one eye or eye redness?", feature: "eye_pain",       rationale: "Periorbital pain is pathognomonic for cluster headache" },
      { id: "ha_aura",    text: "Did you have visual changes, tingling, or weakness before the headache?", feature: "aura", rationale: "Aura is the defining feature distinguishing migraine with aura" },
      { id: "ha_fever",   text: "Do you have a fever?", feature: "fever",                                            rationale: "Fever + severe headache raises urgent concern for meningitis" },
      { id: "ha_vision",  text: "Are you having any vision changes or double vision?", feature: "vision_changes",    rationale: "Vision changes suggest hypertensive emergency or SAH" },
    ],
  },

  abdominal_pain: {
    diagnoses: ["Gastroenteritis", "Appendicitis", "Peptic Ulcer Disease", "Ovarian/Pelvic Pathology", "Bowel Obstruction", "Pancreatitis"],
    priors:    [0.35,             0.15,           0.15,                    0.12,                       0.10,               0.13],
    featureLikelihoods: {
      rlq_pain:        { "Gastroenteritis": 0.20, "Appendicitis": 0.85, "Peptic Ulcer Disease": 0.05, "Ovarian/Pelvic Pathology": 0.35, "Bowel Obstruction": 0.10, "Pancreatitis": 0.05 },
      fever:           { "Gastroenteritis": 0.60, "Appendicitis": 0.75, "Peptic Ulcer Disease": 0.10, "Ovarian/Pelvic Pathology": 0.40, "Bowel Obstruction": 0.30, "Pancreatitis": 0.40 },
      rebound:         { "Gastroenteritis": 0.10, "Appendicitis": 0.80, "Peptic Ulcer Disease": 0.30, "Ovarian/Pelvic Pathology": 0.45, "Bowel Obstruction": 0.40, "Pancreatitis": 0.35 },
      epigastric:      { "Gastroenteritis": 0.20, "Appendicitis": 0.05, "Peptic Ulcer Disease": 0.75, "Ovarian/Pelvic Pathology": 0.05, "Bowel Obstruction": 0.10, "Pancreatitis": 0.70 },
      radiation_back:  { "Gastroenteritis": 0.05, "Appendicitis": 0.05, "Peptic Ulcer Disease": 0.15, "Ovarian/Pelvic Pathology": 0.10, "Bowel Obstruction": 0.05, "Pancreatitis": 0.75 },
      vomiting_no_relief: { "Gastroenteritis": 0.20, "Appendicitis": 0.40, "Peptic Ulcer Disease": 0.10, "Ovarian/Pelvic Pathology": 0.20, "Bowel Obstruction": 0.75, "Pancreatitis": 0.50 },
      last_menstrual:  { "Gastroenteritis": 0.05, "Appendicitis": 0.05, "Peptic Ulcer Disease": 0.05, "Ovarian/Pelvic Pathology": 0.65, "Bowel Obstruction": 0.05, "Pancreatitis": 0.05 },
      alcohol:         { "Gastroenteritis": 0.05, "Appendicitis": 0.05, "Peptic Ulcer Disease": 0.25, "Ovarian/Pelvic Pathology": 0.05, "Bowel Obstruction": 0.05, "Pancreatitis": 0.65 },
    },
    questionBank: [
      { id: "ab_rlq",    text: "Is the pain located in the lower right area of your belly?", feature: "rlq_pain",    rationale: "RLQ pain is the hallmark of appendicitis" },
      { id: "ab_fever",  text: "Do you have a fever?", feature: "fever",                                             rationale: "Fever shifts toward infectious or inflammatory causes" },
      { id: "ab_rebound",text: "Does releasing pressure on your belly quickly cause a sharp pain?", feature: "rebound", rationale: "Rebound tenderness signals peritoneal irritation (appendicitis, rupture)" },
      { id: "ab_epic",   text: "Is the pain centered just below your breastbone (epigastric)?", feature: "epigastric", rationale: "Epigastric pain favors PUD or pancreatitis" },
      { id: "ab_back",   text: "Does the pain radiate straight through to your back?", feature: "radiation_back",    rationale: "Back radiation is a classic pancreatitis pattern" },
      { id: "ab_nrel",   text: "Have you been vomiting and does the pain not get better after?", feature: "vomiting_no_relief", rationale: "Persistent vomiting without relief raises concern for obstruction" },
      { id: "ab_lmp",    text: "When was your last menstrual period, and could you be pregnant?", feature: "last_menstrual", rationale: "Critical to rule out ectopic pregnancy in females of reproductive age" },
      { id: "ab_etoh",   text: "Do you drink alcohol, and if so, how much recently?", feature: "alcohol",           rationale: "Heavy alcohol use is the leading risk factor for pancreatitis" },
    ],
  },

  fever: {
    diagnoses: ["Viral Syndrome", "Bacterial Infection", "Meningitis", "Malaria/Tropical", "COVID-19", "Sepsis"],
    priors:    [0.40,            0.30,                  0.08,          0.05,                0.12,       0.05],
    featureLikelihoods: {
      neck_stiffness:  { "Viral Syndrome": 0.05, "Bacterial Infection": 0.10, "Meningitis": 0.85, "Malaria/Tropical": 0.10, "COVID-19": 0.05, "Sepsis": 0.10 },
      rash:            { "Viral Syndrome": 0.20, "Bacterial Infection": 0.20, "Meningitis": 0.55, "Malaria/Tropical": 0.30, "COVID-19": 0.10, "Sepsis": 0.25 },
      travel:          { "Viral Syndrome": 0.10, "Bacterial Infection": 0.10, "Meningitis": 0.10, "Malaria/Tropical": 0.80, "COVID-19": 0.15, "Sepsis": 0.10 },
      rigors:          { "Viral Syndrome": 0.20, "Bacterial Infection": 0.40, "Meningitis": 0.35, "Malaria/Tropical": 0.80, "COVID-19": 0.20, "Sepsis": 0.65 },
      confusion:       { "Viral Syndrome": 0.05, "Bacterial Infection": 0.10, "Meningitis": 0.70, "Malaria/Tropical": 0.40, "COVID-19": 0.15, "Sepsis": 0.80 },
      cough:           { "Viral Syndrome": 0.55, "Bacterial Infection": 0.30, "Meningitis": 0.10, "Malaria/Tropical": 0.15, "COVID-19": 0.75, "Sepsis": 0.20 },
      petechiae:       { "Viral Syndrome": 0.05, "Bacterial Infection": 0.10, "Meningitis": 0.50, "Malaria/Tropical": 0.10, "COVID-19": 0.05, "Sepsis": 0.20 },
    },
    questionBank: [
      { id: "fv_neck",   text: "Is your neck stiff or painful to bend forward?", feature: "neck_stiffness",       rationale: "Neck stiffness + fever is meningitis until proven otherwise" },
      { id: "fv_rash",   text: "Do you have any rash? If so, does it turn white when pressed?", feature: "rash", rationale: "Non-blanching rash is a critical sign of meningococcemia" },
      { id: "fv_travel", text: "Have you traveled outside the country in the past 30 days?", feature: "travel",   rationale: "Travel history is essential for malaria, dengue, typhoid screening" },
      { id: "fv_rigors", text: "Do you have shaking chills (rigors) with the fever?", feature: "rigors",         rationale: "Rigors suggest bacteremia, malaria, or pyelonephritis" },
      { id: "fv_conf",   text: "Have you been confused, disoriented, or difficult to wake?", feature: "confusion", rationale: "Altered mental status signals meningitis or severe sepsis" },
      { id: "fv_cough",  text: "Do you have a cough or shortness of breath?", feature: "cough",                  rationale: "Pulmonary symptoms shift toward viral or COVID-19" },
      { id: "fv_pete",   text: "Do you have any tiny red or purple spots on your skin?", feature: "petechiae",   rationale: "Petechiae are a critical sign of meningococcal disease" },
    ],
  },

  uti: {
    diagnoses: ["Uncomplicated UTI/Cystitis", "Pyelonephritis", "Sexually Transmitted Infection", "Urethritis", "Vaginal Infection", "Kidney Stone"],
    priors:    [0.45,                         0.18,             0.12,                              0.10,         0.10,               0.05],
    featureLikelihoods: {
      flank_pain:      { "Uncomplicated UTI/Cystitis": 0.10, "Pyelonephritis": 0.90, "Sexually Transmitted Infection": 0.05, "Urethritis": 0.10, "Vaginal Infection": 0.05, "Kidney Stone": 0.70 },
      fever:           { "Uncomplicated UTI/Cystitis": 0.10, "Pyelonephritis": 0.80, "Sexually Transmitted Infection": 0.20, "Urethritis": 0.15, "Vaginal Infection": 0.10, "Kidney Stone": 0.15 },
      discharge:       { "Uncomplicated UTI/Cystitis": 0.05, "Pyelonephritis": 0.05, "Sexually Transmitted Infection": 0.70, "Urethritis": 0.45, "Vaginal Infection": 0.75, "Kidney Stone": 0.05 },
      hematuria:       { "Uncomplicated UTI/Cystitis": 0.35, "Pyelonephritis": 0.40, "Sexually Transmitted Infection": 0.05, "Urethritis": 0.10, "Vaginal Infection": 0.05, "Kidney Stone": 0.75 },
      colicky:         { "Uncomplicated UTI/Cystitis": 0.05, "Pyelonephritis": 0.15, "Sexually Transmitted Infection": 0.05, "Urethritis": 0.05, "Vaginal Infection": 0.05, "Kidney Stone": 0.85 },
      new_partner:     { "Uncomplicated UTI/Cystitis": 0.05, "Pyelonephritis": 0.05, "Sexually Transmitted Infection": 0.70, "Urethritis": 0.65, "Vaginal Infection": 0.30, "Kidney Stone": 0.05 },
    },
    questionBank: [
      { id: "ut_flank",  text: "Do you have pain in your side or back (flank area)?", feature: "flank_pain",      rationale: "Flank pain differentiates pyelonephritis from cystitis" },
      { id: "ut_fever",  text: "Do you have a fever or chills?", feature: "fever",                               rationale: "Fever in UTI suggests upper tract involvement (pyelo)" },
      { id: "ut_disc",   text: "Do you have any unusual discharge?", feature: "discharge",                       rationale: "Discharge suggests STI, urethritis, or vaginitis rather than UTI" },
      { id: "ut_blood",  text: "Have you seen blood in your urine?", feature: "hematuria",                       rationale: "Hematuria is common in cystitis but also a key kidney stone sign" },
      { id: "ut_colic",  text: "Is the pain coming in waves or cramp-like?", feature: "colicky",                 rationale: "Colicky flank pain is the hallmark of renal colic (kidney stone)" },
      { id: "ut_part",   text: "Have you had any new sexual partners or unprotected intercourse recently?", feature: "new_partner", rationale: "New partner history is critical for STI screening" },
    ],
  },
};

function shannonEntropy(probs: number[]): number {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const p of probs) {
    const pn = p / total;
    if (pn > 1e-10) entropy -= pn * Math.log2(pn);
  }
  return entropy;
}

function normalizeProbs(probs: number[]): number[] {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total === 0) return probs.map(() => 1 / probs.length);
  return probs.map(p => p / total);
}

function bayesianUpdate(priorProbs: number[], likelihoods: number[]): number[] {
  const posterior = priorProbs.map((p, i) => p * likelihoods[i]);
  const total = posterior.reduce((a, b) => a + b, 0);
  if (total < 1e-10) return priorProbs;
  return posterior.map(p => p / total);
}

export function computeAdaptiveQuestions(
  complaint: string,
  presentFeatures: string[],
  absentFeatures: string[],
  differential?: Array<{ diagnosis: string; score: number }>
): AdaptiveQuestionResult {
  const spec = COMPLAINT_SPECS[complaint];

  if (!spec) {
    return {
      complaint,
      currentEntropy: 0,
      topDiagnosis: "unknown",
      topProbability: 0,
      questions: [],
      differential: [],
    };
  }

  const answeredFeatures = new Set([...presentFeatures, ...absentFeatures]);

  let currentProbs = [...spec.priors];

  for (const feature of presentFeatures) {
    const likelihoods = spec.diagnoses.map(dx => spec.featureLikelihoods[feature]?.[dx] ?? 0.5);
    currentProbs = bayesianUpdate(currentProbs, likelihoods);
  }
  for (const feature of absentFeatures) {
    const likelihoods = spec.diagnoses.map(dx => 1 - (spec.featureLikelihoods[feature]?.[dx] ?? 0.5));
    currentProbs = bayesianUpdate(currentProbs, likelihoods);
  }

  if (differential && differential.length > 0) {
    const dxMap: Record<string, number> = {};
    for (const d of differential) dxMap[d.diagnosis] = d.score;
    const blended = spec.diagnoses.map((dx, i) => {
      const extScore = dxMap[dx] ?? 0;
      return currentProbs[i] * 0.6 + extScore * 0.4;
    });
    const blendedNorm = normalizeProbs(blended);
    currentProbs = blendedNorm;
  }

  currentProbs = normalizeProbs(currentProbs);

  const currentEntropy = shannonEntropy(currentProbs);

  const candidateQuestions = spec.questionBank.filter(q => !answeredFeatures.has(q.feature));

  const scoredQuestions: AdaptiveQuestion[] = candidateQuestions.map(q => {
    const featureLikelihoods = spec.diagnoses.map(dx => spec.featureLikelihoods[q.feature]?.[dx] ?? 0.5);

    const pYes = currentProbs.reduce((sum, p, i) => sum + p * featureLikelihoods[i], 0);
    const pNo = 1 - pYes;

    const probsIfYes = bayesianUpdate(currentProbs, featureLikelihoods);
    const probsIfNo = bayesianUpdate(currentProbs, featureLikelihoods.map(l => 1 - l));

    const entropyIfYes = shannonEntropy(probsIfYes);
    const entropyIfNo = shannonEntropy(probsIfNo);

    const expectedEntropy = pYes * entropyIfYes + pNo * entropyIfNo;
    const expectedInfoGain = currentEntropy - expectedEntropy;

    return {
      id: q.id,
      text: q.text,
      feature: q.feature,
      expectedInfoGain: Math.max(0, expectedInfoGain),
      rationale: q.rationale,
      currentEntropy: Math.round(currentEntropy * 1000) / 1000,
      entropyIfYes: Math.round(entropyIfYes * 1000) / 1000,
      entropyIfNo: Math.round(entropyIfNo * 1000) / 1000,
      pYes: Math.round(pYes * 1000) / 1000,
    };
  });

  scoredQuestions.sort((a, b) => b.expectedInfoGain - a.expectedInfoGain);

  // Packet 12 fix: filter out zero-gain questions before returning.
  // A question with expectedInfoGain = 0 provides no clinical information —
  // asking it wastes a turn and frustrates the patient. We keep only those
  // that strictly reduce uncertainty (> 0 after the Math.max(0,…) floor).
  const usefulQuestions = scoredQuestions.filter(q => q.expectedInfoGain > 0);

  const topIdx = currentProbs.indexOf(Math.max(...currentProbs));

  return {
    complaint,
    currentEntropy: Math.round(currentEntropy * 1000) / 1000,
    topDiagnosis: spec.diagnoses[topIdx],
    topProbability: Math.round(currentProbs[topIdx] * 1000) / 1000,
    questions: usefulQuestions.slice(0, 5),
    differential: spec.diagnoses.map((dx, i) => ({
      diagnosis: dx,
      probability: Math.round(currentProbs[i] * 1000) / 1000,
    })).sort((a, b) => b.probability - a.probability),
  };
}

export function extractPresentFeatures(symptomsText: string, complaint: string): string[] {
  const lower = symptomsText.toLowerCase();
  const spec = COMPLAINT_SPECS[complaint];
  if (!spec) return [];

  const present: string[] = [];
  const featureKeywords: Record<string, string[]> = {
    fever: ["fever", "febrile", "temperature", "hot", "chills"],
    exudate: ["white patches", "pus", "exudate", "white spots"],
    cough_absent: [],
    swollen_lymph_nodes: ["swollen glands", "lymph nodes", "neck lumps", "adenopathy"],
    trismus: ["jaw", "trismus", "open mouth", "opening mouth", "difficulty opening", "jaw pain", "locked jaw", "can't open"],
    drooling: ["drool", "saliva", "manage saliva", "drooling"],
    difficulty_swallowing: ["difficulty swallowing", "swallowing hurts", "odynophagia", "blocked swallow", "hard to swallow", "painful swallowing"],
    fatigue: ["fatigue", "tired", "exhausted", "weak"],
    shortness_of_breath: ["shortness of breath", "short of breath", "sob", "breathless", "dyspnea"],
    productive_cough: ["phlegm", "sputum", "productive", "coughing up"],
    chest_pain: ["chest pain", "chest hurt", "chest tightness"],
    night_symptoms: ["night", "nocturnal", "wakes me up", "worse at night"],
    duration_3wk: ["weeks", "month", "chronic", "long time"],
    whoop: ["whooping", "whoop"],
    loss_of_smell: ["smell", "taste", "anosmia"],
    radiation: ["radiation", "radiating", "arm", "jaw", "neck pain"],
    diaphoresis: ["sweating", "sweat", "clammy", "diaphoresis"],
    reproducible: ["reproducible", "pressing", "palpation"],
    pleuritic: ["breathe in", "deep breath", "pleuritic", "breathing makes it worse"],
    worse_lying: ["lying", "lying flat", "bending forward", "positional"],
    immobilization: ["bed rest", "flight", "immobile", "leg swelling", "dvt"],
    thunderclap: ["sudden", "worst headache", "thunderclap", "instant"],
    neck_stiffness: ["stiff neck", "neck stiffness", "nuchal"],
    photophobia: ["light", "photophobia", "bright light"],
    nausea_vomiting: ["nausea", "vomiting", "vomited"],
    eye_pain: ["eye pain", "around eye", "periorbital"],
    aura: ["aura", "visual changes before", "tingling before"],
    vision_changes: ["vision changes", "double vision", "blurry"],
    rlq_pain: ["right lower", "rlq", "right side", "right of belly"],
    rebound: ["rebound", "release pressure", "worse releasing"],
    epigastric: ["epigastric", "below breastbone", "upper middle"],
    radiation_back: ["back pain", "radiates to back", "through to back"],
    vomiting_no_relief: ["vomiting", "not relieved", "no relief"],
    last_menstrual: ["last period", "pregnant", "lmp", "menstrual"],
    alcohol: ["alcohol", "drinking", "drinks"],
    rash: ["rash", "spots", "petechiae", "purpura"],
    travel: ["travel", "abroad", "overseas", "international"],
    rigors: ["rigors", "shaking chills", "shaking", "violent chills"],
    confusion: ["confused", "confusion", "disoriented", "altered"],
    petechiae: ["petechiae", "tiny spots", "purple spots", "red dots"],
    flank_pain: ["flank", "side pain", "back pain", "costovertebral"],
    discharge: ["discharge", "vaginal discharge", "penile discharge"],
    hematuria: ["blood in urine", "hematuria", "red urine", "pink urine"],
    colicky: ["colicky", "waves", "cramping", "cramp-like"],
    new_partner: ["new partner", "unprotected", "sexual contact"],
    sob: ["short of breath", "sob", "breathless", "dyspnea"],
  };

  for (const [feature, keywords] of Object.entries(featureKeywords)) {
    if (spec.featureLikelihoods[feature] === undefined) continue;
    if (keywords.some(kw => lower.includes(kw))) {
      present.push(feature);
    }
  }

  return present;
}
