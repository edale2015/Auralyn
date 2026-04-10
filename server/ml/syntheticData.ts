import type { RawInput } from "./featureStore";

const COMPLAINTS = [
  "chest_pain", "shortness_of_breath", "abdominal_pain", "fever", "headache",
  "sore_throat", "back_pain", "uti", "laceration", "dizziness",
];

const SYMPTOMS_MAP: Record<string, string> = {
  chest_pain:          "chest pain, pressure, diaphoresis",
  shortness_of_breath: "shortness of breath, dyspnea at rest",
  abdominal_pain:      "abdominal pain, nausea",
  fever:               "fever, chills, body aches",
  headache:            "headache, photophobia",
  sore_throat:         "sore throat, odynophagia",
  back_pain:           "lower back pain",
  uti:                 "dysuria, frequency, flank pain",
  laceration:          "wound, laceration",
  dizziness:           "dizziness, lightheadedness",
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

export function generateSynthetic(n: number, seed?: number): RawInput[] {
  const rand = seed != null ? seededRandom(seed) : Math.random.bind(Math);

  return Array.from({ length: n }, () => {
    const ageYears = Math.floor(rand() * 85) + 15;
    const complaint = COMPLAINTS[Math.floor(rand() * COMPLAINTS.length)];
    const isHighRisk = rand() > 0.7;

    return {
      ageYears,
      complaint,
      symptoms: SYMPTOMS_MAP[complaint],
      vitals: {
        systolicBp:       isHighRisk ? 75 + Math.floor(rand() * 30) : 110 + Math.floor(rand() * 40),
        diastolicBp:      isHighRisk ? 50 + Math.floor(rand() * 20) : 70 + Math.floor(rand() * 25),
        oxygenSaturation: isHighRisk ? 85 + Math.floor(rand() * 8)  : 94 + Math.floor(rand() * 5),
        heartRate:        isHighRisk ? 100 + Math.floor(rand() * 50) : 60 + Math.floor(rand() * 40),
        respiratoryRate:  isHighRisk ? 20 + Math.floor(rand() * 16)  : 12 + Math.floor(rand() * 8),
        temperature:      isHighRisk ? 99 + rand() * 4               : 97 + rand() * 2,
      },
    };
  });
}

export interface LabeledSyntheticRow {
  input:   RawInput;
  label:   0 | 1;
  admitted: boolean;
}

export function generateLabeledDataset(n: number, seed?: number): LabeledSyntheticRow[] {
  const { predictAdmission } = require("./admissionModel");
  const inputs = generateSynthetic(n, seed);

  return inputs.map(input => {
    const { risk } = predictAdmission(input);
    const admitted = risk === "high" || (risk === "medium" && Math.random() > 0.6);
    return { input, label: admitted ? 1 : 0, admitted };
  });
}
