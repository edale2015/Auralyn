export interface NormalizedInput {
  complaint: string;
  symptoms: string[];
  rawText: string;
  normalizedAt: number;
}

const SYMPTOM_MAP: Record<string, string> = {
  "sore throat": "sore_throat",
  "runny nose": "nasal_discharge",
  "stuffy nose": "nasal_congestion",
  "blocked nose": "nasal_congestion",
  "can't breathe": "shortness_of_breath",
  "hard to breathe": "shortness_of_breath",
  "short of breath": "shortness_of_breath",
  "tummy ache": "abdominal_pain",
  "stomach ache": "abdominal_pain",
  "throwing up": "vomiting",
  "feeling sick": "nausea",
  "dizzy": "dizziness",
  "light headed": "dizziness",
  "head hurts": "headache",
  "ear hurts": "ear_pain",
  "ringing ears": "tinnitus",
  "body aches": "myalgia",
  "can't swallow": "difficulty_swallowing",
  "hard to swallow": "difficulty_swallowing",
  "stiff neck": "neck_stiffness",
};

export class NormalizationLayer {
  normalize(input: any): NormalizedInput {
    const text = (input.input?.text || input.text || "").toLowerCase().trim();
    const symptoms: string[] = [];

    for (const [phrase, symptom] of Object.entries(SYMPTOM_MAP)) {
      if (text.includes(phrase)) symptoms.push(symptom);
    }

    const words = text.split(/[\s,]+/).filter((w: string) => w.length > 2);
    const clinicalTerms = ["fever", "cough", "headache", "nausea", "vomiting", "dizziness",
      "fatigue", "chills", "congestion", "sneezing", "wheezing", "hoarseness"];
    for (const w of words) {
      if (clinicalTerms.includes(w) && !symptoms.includes(w)) symptoms.push(w);
    }

    const complaint = symptoms.length > 0 ? symptoms[0] : text.split(" ").slice(0, 3).join(" ");

    return { complaint, symptoms, rawText: text, normalizedAt: Date.now() };
  }
}

export const normalizationLayer = new NormalizationLayer();
