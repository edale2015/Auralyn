import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { autoCodeDiagnosisCluster } from "../billing/diagnosisAutoCoder";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

const SYMPTOM_DIAGNOSIS_MAP: Record<string, { dx: string; differentials: string[]; baseConfidence: number }> = {
  "chest pain": { dx: "ACS", differentials: ["Chest Pain", "Pulmonary Embolism", "GERD"], baseConfidence: 0.72 },
  "sore throat": { dx: "Streptococcal Pharyngitis", differentials: ["Sore Throat", "Otitis Media"], baseConfidence: 0.78 },
  "headache": { dx: "Migraine", differentials: ["Tension Headache", "Cluster Headache", "Sinusitis"], baseConfidence: 0.75 },
  "shortness of breath": { dx: "Asthma Exacerbation", differentials: ["COPD Exacerbation", "Pneumonia", "Pulmonary Embolism"], baseConfidence: 0.65 },
  "abdominal pain": { dx: "Appendicitis", differentials: ["Gastroenteritis", "GERD", "Abdominal Pain"], baseConfidence: 0.60 },
  "cough": { dx: "Pneumonia", differentials: ["Asthma Exacerbation", "COPD Exacerbation"], baseConfidence: 0.70 },
  "fever": { dx: "Community-Acquired Pneumonia", differentials: ["Urinary Tract Infection", "Cellulitis"], baseConfidence: 0.62 },
  "dizziness": { dx: "Vertigo", differentials: ["Syncope", "Stroke"], baseConfidence: 0.68 },
  "back pain": { dx: "Back Pain", differentials: ["Fracture"], baseConfidence: 0.80 },
  "ankle": { dx: "Ankle Sprain", differentials: ["Fracture"], baseConfidence: 0.82 },
  "rash": { dx: "Allergic Reaction", differentials: ["Cellulitis", "Conjunctivitis"], baseConfidence: 0.72 },
  "urinary": { dx: "Urinary Tract Infection", differentials: [], baseConfidence: 0.85 },
  "seizure": { dx: "Seizure", differentials: ["Syncope", "Stroke"], baseConfidence: 0.70 },
  "fainting": { dx: "Syncope", differentials: ["Seizure", "Vertigo"], baseConfidence: 0.72 },
  "depression": { dx: "Depression", differentials: ["Anxiety"], baseConfidence: 0.68 },
  "anxiety": { dx: "Anxiety", differentials: ["Depression"], baseConfidence: 0.70 },
  "alcohol": { dx: "Alcohol Withdrawal", differentials: ["Seizure"], baseConfidence: 0.65 },
  "ear pain": { dx: "Otitis Media", differentials: ["Sinusitis"], baseConfidence: 0.80 },
  "eye": { dx: "Conjunctivitis", differentials: [], baseConfidence: 0.78 },
  "heartburn": { dx: "GERD", differentials: ["Chest Pain", "ACS"], baseConfidence: 0.74 },
  "stroke": { dx: "Stroke", differentials: ["Seizure", "Syncope", "Migraine"], baseConfidence: 0.60 },
  "diaphoresis": { dx: "ACS", differentials: ["Myocardial Infarction"], baseConfidence: 0.68 },
};

function matchDiagnosis(text: string): { dx: string; differentials: string[]; confidence: number } {
  const lower = text.toLowerCase();
  let bestMatch: { dx: string; differentials: string[]; confidence: number } | null = null;

  for (const [keyword, entry] of Object.entries(SYMPTOM_DIAGNOSIS_MAP)) {
    if (lower.includes(keyword)) {
      const wordCount = text.split(/\s+/).length;
      const detailBoost = Math.min(0.1, wordCount * 0.005);
      const confidence = Math.min(0.95, entry.baseConfidence + detailBoost);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { dx: entry.dx, differentials: entry.differentials, confidence };
      }
    }
  }

  return bestMatch || { dx: "Illness, unspecified", differentials: [], confidence: 0.35 };
}

export const diagnosisAgent: Agent = {
  name: "diagnosis",
  priority: 20,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();
    const { dx, differentials, confidence } = matchDiagnosis(ctx.text);

    const triageSeverity = priorResults.triage?.severity || "low";
    let triage = "routine";
    if (triageSeverity === "critical") triage = "emergency";
    else if (triageSeverity === "high") triage = "ER";
    else if (triageSeverity === "moderate") triage = "urgent";

    const coding = autoCodeDiagnosisCluster({
      primary: dx,
      differentials,
      triage,
      confidence,
    });

    const result = {
      dx,
      differentials,
      confidence,
      triage,
      coding: {
        primary: coding.primary,
        cpt: coding.cpt,
        codingConfidence: coding.codingConfidence,
        warnings: coding.warnings,
      },
    };

    if (confidence < 0.6) {
      publish("diagnosis:low_confidence", { dx, confidence, text: ctx.text });
    }

    logAgent("diagnosis", { dx, confidence, icd10: coding.primary.icd10 }, Date.now() - start);
    return result;
  },
};
