import { COMPLAINTS, COMPLAINTS_SET } from "../../shared/complaints";

const ALIAS_MAP: Record<string, string> = {
  "sore throat": "sore_throat",
  "strep throat": "sore_throat",
  "throat pain": "sore_throat",
  "pharyngitis": "sore_throat",
  "tonsillitis": "sore_throat",
  "earache": "ear_pain",
  "ear infection": "ear_pain",
  "otitis": "ear_pain",
  "stomach ache": "abdominal_pain",
  "stomach pain": "abdominal_pain",
  "belly pain": "abdominal_pain",
  "tummy ache": "abdominal_pain",
  "throwing up": "nausea_vomiting",
  "vomiting": "nausea_vomiting",
  "nausea": "nausea_vomiting",
  "puking": "nausea_vomiting",
  "runny nose": "nasal_congestion",
  "stuffy nose": "nasal_congestion",
  "blocked nose": "nasal_congestion",
  "congestion": "nasal_congestion",
  "head cold": "nasal_congestion",
  "migraine": "headache",
  "head pain": "headache",
  "shortness of breath": "shortness_of_breath",
  "can't breathe": "shortness_of_breath",
  "difficulty breathing": "shortness_of_breath",
  "breathing problems": "shortness_of_breath",
  "dyspnea": "shortness_of_breath",
  "heart racing": "palpitations",
  "rapid heartbeat": "palpitations",
  "irregular heartbeat": "palpitations",
  "racing heart": "palpitations",
  "chest tightness": "chest_pain",
  "chest pressure": "chest_pain",
  "burning pee": "uti",
  "painful urination": "uti",
  "urinary infection": "uti",
  "bladder infection": "uti",
  "skin rash": "rash",
  "hives": "urticaria",
  "itchy skin": "rash",
  "back pain": "back_pain",
  "backache": "back_pain",
  "lumbago": "back_pain",
  "feeling dizzy": "dizziness",
  "vertigo": "dizziness",
  "lightheaded": "dizziness",
  "room spinning": "dizziness",
  "pink eye": "red_eye",
  "red eye": "red_eye",
  "conjunctivitis": "red_eye",
  "loose stools": "diarrhea",
  "watery stool": "diarrhea",
  "the runs": "diarrhea",
  "constipated": "constipation",
  "can't poop": "constipation",
  "joint pain": "joint_pain",
  "achy joints": "joint_pain",
  "arthritis pain": "joint_pain",
  "anxious": "anxiety",
  "anxiety attack": "anxiety",
  "panic attack": "anxiety",
  "feeling down": "depression",
  "sad": "depression",
  "depressed": "depression",
  "can't sleep": "insomnia",
  "sleep problems": "insomnia",
  "trouble sleeping": "insomnia",
  "asthma attack": "wheezing",
  "wheeze": "wheezing",
  "high sugar": "hyperglycemia",
  "blood sugar high": "hyperglycemia",
  "low sugar": "hypoglycemia",
  "blood sugar low": "hypoglycemia",
  "nosebleed": "epistaxis",
  "bloody nose": "epistaxis",
  "swollen ankle": "leg_swelling",
  "swollen leg": "leg_swelling",
  "swollen feet": "leg_swelling",
  "fainting": "syncope",
  "passed out": "syncope",
  "fainted": "syncope",
  "high blood pressure": "hypertensive_urgency",
  "blood in urine": "hematuria",
  "bloody urine": "hematuria",
  "side pain": "flank_pain",
  "kidney pain": "flank_pain",
  "muscle pain": "muscle_weakness",
  "body aches": "flu_like",
  "sore muscles": "muscle_weakness",
  "wound": "laceration",
  "cut": "laceration",
  "burn": "burns",
  "burned": "burns",
  "allergic reaction": "allergic_reaction",
  "allergy": "allergic_reaction",
  "fever": "fever",
  "high temperature": "fever",
  "chills": "fever",
  "bite": "animal_bite",
  "bitten": "animal_bite",
  "numbness": "weakness_numbness",
  "tingling": "weakness_numbness",
  "weak": "weakness_numbness",
  "seizure": "seizure",
  "convulsion": "seizure",
  "fit": "seizure",
};

(function validateAliases() {
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (!COMPLAINTS_SET.has(canonical)) {
      console.error(`[AliasRegistry] WARNING: alias "${alias}" maps to unknown canonical "${canonical}"`);
    }
  }
})();

export function resolveComplaint(input: string): string {
  const normalized = input.toLowerCase().trim().replace(/[_-]/g, " ");

  if (COMPLAINTS_SET.has(input)) return input;

  const slugified = normalized.replace(/\s+/g, "_");
  if (COMPLAINTS_SET.has(slugified)) return slugified;

  if (ALIAS_MAP[normalized]) return ALIAS_MAP[normalized];

  return input;
}

export function getAliasMap(): Record<string, string> {
  return { ...ALIAS_MAP };
}

export function getCanonicalComplaints(): string[] {
  return [...COMPLAINTS];
}

export function addAlias(alias: string, canonical: string): boolean {
  if (!COMPLAINTS_SET.has(canonical)) return false;
  ALIAS_MAP[alias.toLowerCase().trim()] = canonical;
  return true;
}
