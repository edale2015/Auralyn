import { getKnowledgeGraph } from "../../knowledge/knowledgeGraphStore";

export interface DiagnosisCandidate {
  name: string;
  system: string;
  confidence: number;
}

const SYMPTOM_DIAGNOSIS_MAP: Record<string, DiagnosisCandidate[]> = {
  cough: [
    { name: "URI", system: "respiratory", confidence: 0.6 },
    { name: "Bronchitis", system: "respiratory", confidence: 0.3 },
    { name: "Pneumonia", system: "respiratory", confidence: 0.15 },
  ],
  fever: [
    { name: "Influenza", system: "respiratory", confidence: 0.4 },
    { name: "URI", system: "respiratory", confidence: 0.3 },
    { name: "COVID-19", system: "respiratory", confidence: 0.2 },
  ],
  sore_throat: [
    { name: "Strep Pharyngitis", system: "ent", confidence: 0.5 },
    { name: "URI", system: "respiratory", confidence: 0.3 },
  ],
  headache: [
    { name: "Tension Headache", system: "neuro", confidence: 0.4 },
    { name: "Migraine", system: "neuro", confidence: 0.3 },
    { name: "Sinusitis", system: "ent", confidence: 0.2 },
  ],
  ear_pain: [
    { name: "Otitis Media", system: "ent", confidence: 0.5 },
    { name: "Sinusitis", system: "ent", confidence: 0.2 },
  ],
  dizziness: [
    { name: "BPPV", system: "neuro", confidence: 0.4 },
    { name: "Labyrinthitis", system: "ent", confidence: 0.3 },
  ],
  nasal_congestion: [
    { name: "Allergic Rhinitis", system: "ent", confidence: 0.4 },
    { name: "Sinusitis", system: "ent", confidence: 0.35 },
    { name: "URI", system: "respiratory", confidence: 0.25 },
  ],
  difficulty_swallowing: [
    { name: "Peritonsillar Abscess", system: "ent", confidence: 0.3 },
    { name: "Epiglottitis", system: "ent", confidence: 0.2 },
    { name: "Strep Pharyngitis", system: "ent", confidence: 0.3 },
  ],
  neck_stiffness: [
    { name: "Meningitis", system: "neuro", confidence: 0.4 },
    { name: "Tension Headache", system: "neuro", confidence: 0.3 },
  ],
  shortness_of_breath: [
    { name: "Pneumonia", system: "respiratory", confidence: 0.35 },
    { name: "COVID-19", system: "respiratory", confidence: 0.25 },
    { name: "Bronchitis", system: "respiratory", confidence: 0.2 },
  ],
};

export class KnowledgeLayer {
  getDiagnoses(symptoms: string[]): DiagnosisCandidate[] {
    const diagMap: Record<string, DiagnosisCandidate> = {};

    for (const s of symptoms) {
      const candidates = SYMPTOM_DIAGNOSIS_MAP[s] || [];
      for (const c of candidates) {
        if (!diagMap[c.name]) {
          diagMap[c.name] = { ...c };
        } else {
          diagMap[c.name].confidence = Math.min(0.99, diagMap[c.name].confidence + c.confidence * 0.5);
        }
      }
    }

    return Object.values(diagMap).sort((a, b) => b.confidence - a.confidence);
  }

  getGraphNodeCount(): number {
    try {
      return getKnowledgeGraph().nodes.length;
    } catch {
      return 0;
    }
  }
}

export const knowledgeLayer = new KnowledgeLayer();
