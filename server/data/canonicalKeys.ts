export const SYSTEM_KEYS = [
  "ENT", "PULM", "CARD", "GI", "GU", "DERM", "MSK", "NEURO", "OPHTH", "GEN",
] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

export const CHIEF_COMPLAINT_KEYS = [
  "sore_throat", "cough", "fever", "abdominal_pain", "uti_symptoms",
  "rash", "back_pain", "headache", "ankle_injury", "chest_pain",
  "shortness_of_breath", "sinus_congestion", "eye_red_discharge",
  "std_exposure", "nausea", "diarrhea", "vaginal_discharge",
  "ear_pain_muffled", "joint_pain",
] as const;
export type ChiefComplaintKey = (typeof CHIEF_COMPLAINT_KEYS)[number];

export const CLUSTER_KEYS = [
  "ENT_PHARYNGITIS", "ENT_OTITIS", "ENT_SINUSITIS",
  "PULM_URI", "PULM_BRONCHITIS", "PULM_PNEUMONIA", "PULM_ASTHMA_EXAC",
  "CARD_CHESTPAIN", "CARD_ACS", "CARD_PE",
  "GI_GASTROENTERITIS", "GI_APPENDICITIS", "GI_GERD",
  "GU_UTI", "GU_PYELO", "GU_VAGDISCH", "GU_STI",
  "DERM_CELLULITIS", "DERM_CONTACT", "DERM_URTICARIA",
  "MSK_STRAIN", "MSK_FRACTURE", "MSK_SEPTIC_JOINT",
  "NEURO_MIGRAINE", "NEURO_THUNDERCLAP", "NEURO_MENINGITIS",
  "OPHTH_CONJUNCTIVITIS", "OPHTH_CORNEAL_ABRASION", "OPHTH_ACUTE_GLAUCOMA",
  "GEN_VIRAL_SYNDROME",
] as const;
export type ClusterKey = (typeof CLUSTER_KEYS)[number];

const COMPLAINT_SYNONYMS: Record<string, ChiefComplaintKey> = {
  "sore throat": "sore_throat",
  "throat pain": "sore_throat",
  "painful throat": "sore_throat",
  "pharyngitis": "sore_throat",
  "strep throat": "sore_throat",
  "cough": "cough",
  "persistent cough": "cough",
  "dry cough": "cough",
  "wet cough": "cough",
  "fever": "fever",
  "high temperature": "fever",
  "febrile": "fever",
  "abdominal pain": "abdominal_pain",
  "stomach pain": "abdominal_pain",
  "belly pain": "abdominal_pain",
  "abd pain": "abdominal_pain",
  "tummy ache": "abdominal_pain",
  "uti symptoms": "uti_symptoms",
  "uti": "uti_symptoms",
  "urinary tract infection": "uti_symptoms",
  "burning urination": "uti_symptoms",
  "dysuria": "uti_symptoms",
  "rash": "rash",
  "skin rash": "rash",
  "hives": "rash",
  "back pain": "back_pain",
  "lower back pain": "back_pain",
  "lumbago": "back_pain",
  "headache": "headache",
  "head pain": "headache",
  "migraine": "headache",
  "cephalgia": "headache",
  "ankle injury": "ankle_injury",
  "twisted ankle": "ankle_injury",
  "ankle sprain": "ankle_injury",
  "chest pain": "chest_pain",
  "chest tightness": "chest_pain",
  "substernal pain": "chest_pain",
  "shortness of breath": "shortness_of_breath",
  "sob": "shortness_of_breath",
  "short of breath": "shortness_of_breath",
  "difficulty breathing": "shortness_of_breath",
  "dyspnea": "shortness_of_breath",
  "sinus congestion": "sinus_congestion",
  "stuffy nose": "sinus_congestion",
  "nasal congestion": "sinus_congestion",
  "blocked nose": "sinus_congestion",
  "sinusitis": "sinus_congestion",
  "eye red discharge": "eye_red_discharge",
  "red eye": "eye_red_discharge",
  "pink eye": "eye_red_discharge",
  "conjunctivitis": "eye_red_discharge",
  "eye discharge": "eye_red_discharge",
  "std exposure": "std_exposure",
  "sti exposure": "std_exposure",
  "sexual exposure": "std_exposure",
  "nausea": "nausea",
  "feeling sick": "nausea",
  "queasy": "nausea",
  "nauseous": "nausea",
  "diarrhea": "diarrhea",
  "loose stools": "diarrhea",
  "watery stool": "diarrhea",
  "vaginal discharge": "vaginal_discharge",
  "vag discharge": "vaginal_discharge",
  "vaginitis": "vaginal_discharge",
  "ear pain muffled": "ear_pain_muffled",
  "ear pain": "ear_pain_muffled",
  "earache": "ear_pain_muffled",
  "muffled hearing": "ear_pain_muffled",
  "otalgia": "ear_pain_muffled",
  "joint pain": "joint_pain",
  "arthralgia": "joint_pain",
  "swollen joint": "joint_pain",
};

const SYSTEM_SYNONYMS: Record<string, SystemKey> = {
  "ent": "ENT",
  "ear nose throat": "ENT",
  "otolaryngology": "ENT",
  "pulmonary": "PULM",
  "pulm": "PULM",
  "respiratory": "PULM",
  "lung": "PULM",
  "cardiac": "CARD",
  "card": "CARD",
  "cardiology": "CARD",
  "cardiovascular": "CARD",
  "heart": "CARD",
  "gastrointestinal": "GI",
  "gi": "GI",
  "gastro": "GI",
  "digestive": "GI",
  "genitourinary": "GU",
  "gu": "GU",
  "urinary": "GU",
  "urology": "GU",
  "gynecology": "GU",
  "dermatology": "DERM",
  "derm": "DERM",
  "skin": "DERM",
  "musculoskeletal": "MSK",
  "msk": "MSK",
  "orthopedic": "MSK",
  "ortho": "MSK",
  "neurology": "NEURO",
  "neuro": "NEURO",
  "neurological": "NEURO",
  "ophthalmology": "OPHTH",
  "ophth": "OPHTH",
  "eye": "OPHTH",
  "eyes": "OPHTH",
  "general": "GEN",
  "gen": "GEN",
};

export function normalizeSystem(raw: string): SystemKey | null {
  const s = raw.trim().toUpperCase();
  if (SYSTEM_KEYS.includes(s as SystemKey)) return s as SystemKey;
  const lower = raw.trim().toLowerCase();
  return SYSTEM_SYNONYMS[lower] ?? null;
}

export function normalizeChiefComplaint(raw: string): ChiefComplaintKey | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (CHIEF_COMPLAINT_KEYS.includes(s.replace(/ /g, "_") as ChiefComplaintKey)) {
    return s.replace(/ /g, "_") as ChiefComplaintKey;
  }
  return COMPLAINT_SYNONYMS[s] ?? null;
}

export function normalizeCluster(raw: string): ClusterKey | null {
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (CLUSTER_KEYS.includes(s as ClusterKey)) return s as ClusterKey;
  return null;
}

export function isValidSystem(s: string): s is SystemKey {
  return SYSTEM_KEYS.includes(s as SystemKey);
}

export function isValidComplaint(s: string): s is ChiefComplaintKey {
  return CHIEF_COMPLAINT_KEYS.includes(s as ChiefComplaintKey);
}

export function isValidCluster(s: string): s is ClusterKey {
  return CLUSTER_KEYS.includes(s as ClusterKey);
}
