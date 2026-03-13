import * as fs from "fs/promises";
import * as path from "path";

const DATASET_FILE = path.join("data", "clinical_master_dataset.json");

export interface ClinicalCase {
  case_id: string;
  complaint: string;
  age: number;
  sex: "male" | "female";
  key_features: string[];
  expected_differential: string[];
  expected_disposition: "er_now" | "urgent_care" | "routine" | "home_care";
  adversarial?: boolean;
  day_of_illness?: number;
}

interface Template {
  key_features: string[];
  expected_differential: string[];
  expected_disposition: ClinicalCase["expected_disposition"];
}

const TEMPLATES: Record<string, Template[]> = {
  chest_pain: [
    { key_features: ["pressure","radiates_left_arm","diaphoresis"], expected_differential: ["acute_coronary_syndrome","aortic_dissection"], expected_disposition: "er_now" },
    { key_features: ["radiates_left_arm","diaphoresis","shortness_of_breath"], expected_differential: ["acute_coronary_syndrome","STEMI"], expected_disposition: "er_now" },
    { key_features: ["sharp","worse_with_breathing","unilateral_leg_swelling"], expected_differential: ["pulmonary_embolism","pleuritis"], expected_disposition: "er_now" },
    { key_features: ["tachycardia","recent_immobility","shortness_of_breath"], expected_differential: ["pulmonary_embolism","pneumothorax"], expected_disposition: "er_now" },
    { key_features: ["reproducible","worse_with_movement","no_radiation"], expected_differential: ["costochondritis","musculoskeletal"], expected_disposition: "home_care" },
    { key_features: ["burning","worse_after_eating","no_exertion"], expected_differential: ["GERD","esophagitis"], expected_disposition: "home_care" },
    { key_features: ["palpitations","anxiety","shortness_of_breath"], expected_differential: ["panic_disorder","SVT"], expected_disposition: "urgent_care" },
    { key_features: ["sharp","pleuritic","fever","cough"], expected_differential: ["pleuritis","pneumonia"], expected_disposition: "urgent_care" },
  ],
  sore_throat: [
    { key_features: ["fever","tonsillar_exudate","no_cough","tender_anterior_nodes"], expected_differential: ["strep_pharyngitis","EBV"], expected_disposition: "routine" },
    { key_features: ["fever","no_cough","exudate","enlarged_tonsils"], expected_differential: ["strep_pharyngitis"], expected_disposition: "routine" },
    { key_features: ["drooling","muffled_voice","trismus","unilateral_swelling"], expected_differential: ["peritonsillar_abscess"], expected_disposition: "er_now" },
    { key_features: ["cough","runny_nose","no_fever","mild_sore_throat"], expected_differential: ["viral_pharyngitis","viral_URI"], expected_disposition: "home_care" },
    { key_features: ["fever","fatigue","posterior_node_swelling","splenomegaly"], expected_differential: ["infectious_mononucleosis"], expected_disposition: "routine" },
    { key_features: ["sore_throat","fever","rash","strawberry_tongue"], expected_differential: ["scarlet_fever","strep_pharyngitis"], expected_disposition: "routine" },
    { key_features: ["mild_sore_throat","allergic_rhinitis","postnasal_drip"], expected_differential: ["allergic_rhinitis","viral_pharyngitis"], expected_disposition: "home_care" },
  ],
  cough: [
    { key_features: ["fever","productive","shortness_of_breath","duration_7_days"], expected_differential: ["pneumonia","bronchitis"], expected_disposition: "urgent_care" },
    { key_features: ["fever","productive","crackles","hypoxia"], expected_differential: ["pneumonia","COVID19"], expected_disposition: "er_now" },
    { key_features: ["dry","runny_nose","no_fever","sore_throat"], expected_differential: ["viral_URI","allergic_rhinitis"], expected_disposition: "home_care" },
    { key_features: ["dry","night_cough","wheezing","shortness_of_breath"], expected_differential: ["asthma","GERD"], expected_disposition: "urgent_care" },
    { key_features: ["chronic","productive","COPD_history","increased_sputum"], expected_differential: ["COPD_exacerbation","bronchitis"], expected_disposition: "urgent_care" },
    { key_features: ["hemoptysis","weight_loss","night_sweats","risk_factors"], expected_differential: ["tuberculosis","lung_cancer"], expected_disposition: "er_now" },
    { key_features: ["dry","postnasal_drip","allergic_symptoms"], expected_differential: ["allergic_cough","upper_airway_cough_syndrome"], expected_disposition: "home_care" },
    { key_features: ["ACE_inhibitor_use","dry","no_other_symptoms"], expected_differential: ["ACE_inhibitor_cough"], expected_disposition: "routine" },
  ],
  abdominal_pain: [
    { key_features: ["rlq_pain","fever","anorexia","rebound_tenderness"], expected_differential: ["appendicitis","ovarian_cyst"], expected_disposition: "er_now" },
    { key_features: ["epigastric","burning","worse_after_eating"], expected_differential: ["gastritis","peptic_ulcer_disease"], expected_disposition: "routine" },
    { key_features: ["rlq_pain","vaginal_bleeding","positive_pregnancy_test"], expected_differential: ["ectopic_pregnancy"], expected_disposition: "er_now" },
    { key_features: ["nausea","vomiting","diarrhea","low_grade_fever"], expected_differential: ["viral_gastroenteritis","food_poisoning"], expected_disposition: "home_care" },
    { key_features: ["severe_rlq","guarding","rigidity","high_fever"], expected_differential: ["perforated_appendix","peritonitis"], expected_disposition: "er_now" },
    { key_features: ["right_upper_quadrant","fatty_food_trigger","nausea"], expected_differential: ["cholecystitis","cholelithiasis"], expected_disposition: "urgent_care" },
    { key_features: ["diffuse","chronic","bloating","change_in_bowel_habits"], expected_differential: ["IBS","IBD"], expected_disposition: "routine" },
    { key_features: ["flank_pain","hematuria","colicky"], expected_differential: ["nephrolithiasis","renal_colic"], expected_disposition: "urgent_care" },
  ],
  fever: [
    { key_features: ["cough","myalgia","fatigue","sudden_onset"], expected_differential: ["influenza","COVID19"], expected_disposition: "home_care" },
    { key_features: ["neck_stiffness","photophobia","severe_headache","confusion"], expected_differential: ["bacterial_meningitis","viral_meningitis"], expected_disposition: "er_now" },
    { key_features: ["fever_5_days","rash","lymphadenopathy","pediatric"], expected_differential: ["Kawasaki_disease","viral_illness"], expected_disposition: "er_now" },
    { key_features: ["rigors","sore_throat","exudate","no_cough"], expected_differential: ["strep_pharyngitis","EBV"], expected_disposition: "routine" },
    { key_features: ["high_fever","tachycardia","confusion","source_of_infection"], expected_differential: ["sepsis","bacteremia"], expected_disposition: "er_now" },
    { key_features: ["low_grade_fever","cough","fatigue","duration_3_days"], expected_differential: ["viral_URI","COVID19"], expected_disposition: "home_care" },
    { key_features: ["fever","rash","travel_history","joint_pain"], expected_differential: ["dengue","malaria","Lyme_disease"], expected_disposition: "urgent_care" },
  ],
  uti: [
    { key_features: ["dysuria","frequency","urgency","no_fever"], expected_differential: ["uncomplicated_UTI","urethritis"], expected_disposition: "routine" },
    { key_features: ["flank_pain","fever","costovertebral_tenderness","dysuria"], expected_differential: ["pyelonephritis"], expected_disposition: "urgent_care" },
    { key_features: ["hematuria","dysuria","frequency"], expected_differential: ["cystitis","urethritis","bladder_stone"], expected_disposition: "routine" },
    { key_features: ["fever","rigors","sepsis_signs","dysuria"], expected_differential: ["urosepsis","pyelonephritis"], expected_disposition: "er_now" },
    { key_features: ["dysuria","pregnancy","frequency"], expected_differential: ["UTI_in_pregnancy"], expected_disposition: "urgent_care" },
    { key_features: ["dysuria","discharge","sexually_active"], expected_differential: ["chlamydia","gonorrhea","urethritis"], expected_disposition: "routine" },
  ],
  ear_pain: [
    { key_features: ["fever","ear_discharge","hearing_loss","recent_URI"], expected_differential: ["acute_otitis_media","otitis_externa"], expected_disposition: "routine" },
    { key_features: ["severe_ear_pain","post_auricular_swelling","fever"], expected_differential: ["mastoiditis"], expected_disposition: "er_now" },
    { key_features: ["ear_pain","jaw_pain","tinnitus","no_fever"], expected_differential: ["TMJ_disorder","eustachian_tube_dysfunction"], expected_disposition: "routine" },
    { key_features: ["itching","discharge","swimmer_history","no_fever"], expected_differential: ["otitis_externa","swimmers_ear"], expected_disposition: "routine" },
    { key_features: ["ear_pain","facial_vesicles","vertigo"], expected_differential: ["Ramsay_Hunt_syndrome"], expected_disposition: "urgent_care" },
  ],
  rash: [
    { key_features: ["fever","spreading","vesicular","painful"], expected_differential: ["herpes_zoster","varicella"], expected_disposition: "urgent_care" },
    { key_features: ["fever","petechiae","meningismus"], expected_differential: ["meningococcemia","ITP"], expected_disposition: "er_now" },
    { key_features: ["itching","urticaria","angioedema","recent_exposure"], expected_differential: ["allergic_reaction","anaphylaxis"], expected_disposition: "er_now" },
    { key_features: ["target_lesion","joint_pain","tick_exposure"], expected_differential: ["Lyme_disease","erythema_migrans"], expected_disposition: "urgent_care" },
    { key_features: ["dry","scaly","pruritic","chronic"], expected_differential: ["eczema","psoriasis"], expected_disposition: "routine" },
    { key_features: ["malar_rash","joint_pain","fatigue","photosensitive"], expected_differential: ["lupus_erythematosus"], expected_disposition: "urgent_care" },
  ],
  sinus_pressure: [
    { key_features: ["facial_pain","duration_10_days","purulent_discharge","fever"], expected_differential: ["acute_bacterial_sinusitis"], expected_disposition: "routine" },
    { key_features: ["facial_pain","nasal_congestion","clear_discharge","no_fever"], expected_differential: ["viral_sinusitis","allergic_rhinitis"], expected_disposition: "home_care" },
    { key_features: ["severe_headache","periorbital_swelling","vision_changes"], expected_differential: ["orbital_cellulitis","cavernous_sinus_thrombosis"], expected_disposition: "er_now" },
    { key_features: ["chronic_congestion","polyp_history","anosmia"], expected_differential: ["chronic_sinusitis","nasal_polyps"], expected_disposition: "routine" },
    { key_features: ["tooth_pain","upper_molar","maxillary_pressure"], expected_differential: ["odontogenic_sinusitis","dental_infection"], expected_disposition: "routine" },
  ],
};

const ADVERSARIAL_CASES: ClinicalCase[] = [
  { case_id: "ADV_001", complaint: "anxiety", age: 34, sex: "female", key_features: ["tachycardia","shortness_of_breath","chest_tightness","recent_flight"], expected_differential: ["pulmonary_embolism","panic_disorder"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_002", complaint: "headache", age: 45, sex: "male", key_features: ["worst_headache_of_life","sudden_onset","vomiting","neck_stiffness"], expected_differential: ["subarachnoid_hemorrhage","meningitis"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_003", complaint: "fever", age: 28, sex: "male", key_features: ["low_grade_fever","cough","fatigue","confusion","tachypnea"], expected_differential: ["sepsis","pneumonia"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_004", complaint: "abdominal_pain", age: 22, sex: "female", key_features: ["vaginal_bleeding","positive_pregnancy_test","right_lower_pain"], expected_differential: ["ectopic_pregnancy"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_005", complaint: "sore_throat", age: 19, sex: "male", key_features: ["drooling","muffled_voice","inability_to_swallow"], expected_differential: ["peritonsillar_abscess","epiglottitis"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_006", complaint: "chest_pain", age: 38, sex: "female", key_features: ["atypical_symptoms","fatigue","jaw_pain","nausea","no_classic_chest_pain"], expected_differential: ["acute_coronary_syndrome"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_007", complaint: "back_pain", age: 55, sex: "male", key_features: ["tearing_pain","radiation_to_back","hypertensive"], expected_differential: ["aortic_dissection"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_008", complaint: "dizziness", age: 67, sex: "female", key_features: ["new_onset","diplopia","dysarthria","ataxia"], expected_differential: ["posterior_stroke","vertebrobasilar_insufficiency"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_009", complaint: "rash", age: 8, sex: "male", key_features: ["non_blanching","petechiae","fever","meningismus"], expected_differential: ["meningococcemia"], expected_disposition: "er_now", adversarial: true },
  { case_id: "ADV_010", complaint: "cough", age: 72, sex: "female", key_features: ["new_onset","confusion","low_grade_fever","aspiration_risk"], expected_differential: ["aspiration_pneumonia","sepsis"], expected_disposition: "er_now", adversarial: true },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateDataset(targetSize = 300): ClinicalCase[] {
  const dataset: ClinicalCase[] = [];
  const complaints = Object.keys(TEMPLATES);
  let id = 1;

  while (dataset.length < targetSize) {
    const complaint = randomElement(complaints);
    const template = randomElement(TEMPLATES[complaint]);
    dataset.push({
      case_id: `CASE_${String(id++).padStart(4, "0")}`,
      complaint,
      age: randomInt(1, 90),
      sex: randomElement(["male", "female"]),
      key_features: [...template.key_features],
      expected_differential: [...template.expected_differential],
      expected_disposition: template.expected_disposition,
    });
  }

  return [...dataset, ...ADVERSARIAL_CASES];
}

let _dataset: ClinicalCase[] | null = null;

export async function loadDataset(): Promise<ClinicalCase[]> {
  if (_dataset) return _dataset;
  try {
    const raw = await fs.readFile(DATASET_FILE, "utf8");
    _dataset = JSON.parse(raw);
    return _dataset!;
  } catch {
    _dataset = generateDataset(300);
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(DATASET_FILE, JSON.stringify(_dataset, null, 2), "utf8");
    return _dataset;
  }
}

export async function getDatasetStats() {
  const ds = await loadDataset();
  const byComplaint: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  const adversarial = ds.filter(c => c.adversarial).length;

  for (const c of ds) {
    byComplaint[c.complaint] = (byComplaint[c.complaint] ?? 0) + 1;
    byDisposition[c.expected_disposition] = (byDisposition[c.expected_disposition] ?? 0) + 1;
  }
  return { total: ds.length, byComplaint, byDisposition, adversarial };
}

export { ADVERSARIAL_CASES };
