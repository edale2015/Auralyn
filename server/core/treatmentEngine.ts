import KnowledgeGraphEngine from "./knowledgeGraphEngine";
import { clinicalEdges } from "../data/clinicalKnowledgeGraph";

const graph = new KnowledgeGraphEngine(clinicalEdges);

export interface TreatmentRecommendation {
  diagnosis: string;
  treatments: string[];
  tests: string[];
  redFlags: string[];
}

export function recommendTreatment(dx: string): string[] {
  return graph.getTreatmentsForDiagnosis(dx);
}

export function getFullRecommendations(dx: string): TreatmentRecommendation {
  return {
    diagnosis: dx,
    treatments: graph.getTreatmentsForDiagnosis(dx),
    tests: graph.getTestsForDiagnosis(dx),
    redFlags: graph.getRedFlags(dx),
  };
}

export function getBulkRecommendations(
  differentials: Array<{ diagnosis?: string; clusterId?: string }>
): TreatmentRecommendation[] {
  return differentials
    .map((d) => d.diagnosis ?? d.clusterId ?? "")
    .filter(Boolean)
    .map(getFullRecommendations);
}
