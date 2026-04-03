import { computeCentorScore, type CentorInput, type CentorResult } from "./centorScore";
import { computeWellsScore, type WellsInput, type WellsResult } from "./wellsScore";
import { computeHeartScore, type HeartInput, type HeartResult } from "./heartScore";
import { computePERCRule, type PERCInput, type PERCResult } from "./percRule";
import { computeCURB65Score, type CURB65Input, type CURB65Result } from "./curb65Score";
import {
  computeOttawaAnkleRule,
  computeOttawaKneeRule,
  type OttawaAnkleInput,
  type OttawaKneeInput,
} from "./ottawaRules";

export type ScoringSystemId =
  | "CENTOR"
  | "WELLS_PE"
  | "HEART"
  | "PERC"
  | "CURB65"
  | "OTTAWA_ANKLE"
  | "OTTAWA_KNEE";

export interface ScoringSystemMeta {
  id: ScoringSystemId;
  name: string;
  description: string;
  maxScore: number | null;
  clinicalUse: string;
}

const REGISTRY: Record<ScoringSystemId, ScoringSystemMeta> = {
  CENTOR: {
    id: "CENTOR", name: "Modified Centor Score",
    description: "Predicts likelihood of streptococcal pharyngitis",
    maxScore: 5,
    clinicalUse: "Sore throat — guides strep testing and antibiotic use",
  },
  WELLS_PE: {
    id: "WELLS_PE", name: "Wells Score for PE",
    description: "Predicts probability of pulmonary embolism",
    maxScore: 12.5,
    clinicalUse: "Chest pain / dyspnea — stratifies PE pretest probability",
  },
  HEART: {
    id: "HEART", name: "HEART Score",
    description: "Predicts major adverse cardiac events (MACE) in chest pain patients",
    maxScore: 10,
    clinicalUse: "Chest pain — guides admission vs. discharge in possible ACS",
  },
  PERC: {
    id: "PERC", name: "PERC Rule",
    description: "8-criterion rule-out criteria for pulmonary embolism",
    maxScore: 8,
    clinicalUse: "Low pretest probability dyspnea — rules out PE without D-dimer if all 8 criteria absent",
  },
  CURB65: {
    id: "CURB65", name: "CURB-65 Score",
    description: "Community-acquired pneumonia 30-day mortality severity score",
    maxScore: 5,
    clinicalUse: "Pneumonia — guides outpatient vs. inpatient vs. ICU admission",
  },
  OTTAWA_ANKLE: {
    id: "OTTAWA_ANKLE", name: "Ottawa Ankle Rule",
    description: "Determines whether ankle/foot X-ray is needed after ankle injury",
    maxScore: null,
    clinicalUse: "Ankle/foot trauma — reduces unnecessary radiography (~97% fracture sensitivity)",
  },
  OTTAWA_KNEE: {
    id: "OTTAWA_KNEE", name: "Ottawa Knee Rule",
    description: "Determines whether knee X-ray is needed after knee injury",
    maxScore: null,
    clinicalUse: "Knee trauma — reduces unnecessary radiography (~98% fracture sensitivity)",
  },
};

export function listScoringSystems(): ScoringSystemMeta[] {
  return Object.values(REGISTRY);
}

export function getScoringSystem(id: ScoringSystemId): ScoringSystemMeta | undefined {
  return REGISTRY[id];
}

export function computeScore(id: ScoringSystemId, input: any): any {
  switch (id) {
    case "CENTOR":       return computeCentorScore(input as CentorInput);
    case "WELLS_PE":     return computeWellsScore(input as WellsInput);
    case "HEART":        return computeHeartScore(input as HeartInput);
    case "PERC":         return computePERCRule(input as PERCInput);
    case "CURB65":       return computeCURB65Score(input as CURB65Input);
    case "OTTAWA_ANKLE": return computeOttawaAnkleRule(input as OttawaAnkleInput);
    case "OTTAWA_KNEE":  return computeOttawaKneeRule(input as OttawaKneeInput);
    default: throw new Error(`Unknown scoring system: ${id}`);
  }
}
