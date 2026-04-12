import { graphStore } from "./graphStore";
import { RelationType } from "./schema";

export interface DiseaseMatch {
  disease: string;
  score:   number;
  path:    string;
}

/**
 * Given one or more symptoms, return diseases they INDICATE, sorted by total weight.
 */
export function getRelatedDiseases(symptom: string | string[]): DiseaseMatch[] {
  const symptoms = Array.isArray(symptom) ? symptom : [symptom];
  const scores   = new Map<string, number>();

  for (const s of symptoms) {
    const edges = graphStore.allEdges().filter(
      (e) => e.from === s && e.relation === RelationType.INDICATES
    );
    for (const e of edges) {
      scores.set(e.to, (scores.get(e.to) ?? 0) + e.weight);
    }
  }

  return Array.from(scores.entries())
    .map(([disease, score]) => ({ disease, score: Number(score.toFixed(3)), path: `${symptoms.join("+")} → ${disease}` }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Recommended tests for a given suspected disease.
 */
export function getRecommendedTests(disease: string): string[] {
  return graphStore.getRelated(disease, RelationType.SUPPORTS);
}

/**
 * Recommended treatments for a given disease.
 */
export function getRecommendedTreatments(disease: string): string[] {
  return graphStore.getRelated(disease, RelationType.TREATED_BY);
}

/**
 * All risk factors that CAUSE a given disease.
 */
export function getRiskFactors(disease: string): string[] {
  return graphStore.getRelatedTo(disease, RelationType.CAUSES);
}

/**
 * Full diagnostic context for a symptom cluster.
 */
export function getDiagnosticContext(symptoms: string[]) {
  const candidates = getRelatedDiseases(symptoms);
  return candidates.map((c) => ({
    ...c,
    tests:      getRecommendedTests(c.disease),
    treatments: getRecommendedTreatments(c.disease),
    riskFactors:getRiskFactors(c.disease),
  }));
}
