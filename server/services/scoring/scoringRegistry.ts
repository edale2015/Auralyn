import { computeCentorScore, type CentorInput, type CentorResult } from "./centorScore";
import { computeWellsScore, type WellsInput, type WellsResult } from "./wellsScore";
import { computeHeartScore, type HeartInput, type HeartResult } from "./heartScore";

export type ScoringSystemId = "CENTOR" | "WELLS_PE" | "HEART";

export interface ScoringSystemMeta {
  id: ScoringSystemId;
  name: string;
  description: string;
  maxScore: number;
}

const REGISTRY: Record<ScoringSystemId, ScoringSystemMeta> = {
  CENTOR: { id: "CENTOR", name: "Modified Centor Score", description: "Predicts likelihood of streptococcal pharyngitis", maxScore: 5 },
  WELLS_PE: { id: "WELLS_PE", name: "Wells Score for PE", description: "Predicts probability of pulmonary embolism", maxScore: 12.5 },
  HEART: { id: "HEART", name: "HEART Score", description: "Predicts MACE in chest pain patients", maxScore: 10 },
};

export function listScoringSystems(): ScoringSystemMeta[] {
  return Object.values(REGISTRY);
}

export function getScoringSystem(id: ScoringSystemId): ScoringSystemMeta | undefined {
  return REGISTRY[id];
}

export function computeScore(id: ScoringSystemId, input: any): any {
  switch (id) {
    case "CENTOR": return computeCentorScore(input as CentorInput);
    case "WELLS_PE": return computeWellsScore(input as WellsInput);
    case "HEART": return computeHeartScore(input as HeartInput);
    default: throw new Error(`Unknown scoring system: ${id}`);
  }
}
