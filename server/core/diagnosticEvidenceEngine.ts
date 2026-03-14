import KnowledgeGraphEngine from "./knowledgeGraphEngine";
import { clinicalEdges } from "../data/clinicalKnowledgeGraph";
import { computeDifferentialProbabilities } from "../services/diagnostic/differentialProbabilityEngine";

const graph = new KnowledgeGraphEngine(clinicalEdges);

export interface EvidenceResult {
  diagnosis: string;
  graphScore: number;
  bayesianProbability: number;
  combinedScore: number;
  tests: string[];
  treatments: string[];
  redFlags: string[];
}

export function diagnosticEvidenceEngine(
  symptoms: string[],
  answers: Record<string, unknown> = {}
): EvidenceResult[] {
  const graphResults = graph.findDiagnosesFromSymptoms(symptoms);

  if (graphResults.length === 0) return [];

  const dxCandidates = graphResults.map((r) => ({ clusterId: r.diagnosis, score: r.score }));
  const bayesian = computeDifferentialProbabilities(dxCandidates, answers);
  const bayesianMap = new Map(bayesian.map((b) => [b.clusterId, b.posteriorProbability]));

  const totalGraph = graphResults.reduce((s, r) => s + r.score, 0) || 1;

  return graphResults
    .map((r) => {
      const bayesProb = bayesianMap.get(r.diagnosis) ?? 0;
      const graphNorm = r.score / totalGraph;
      return {
        diagnosis: r.diagnosis,
        graphScore: r.score,
        bayesianProbability: bayesProb,
        combinedScore: 0.4 * graphNorm + 0.6 * bayesProb,
        tests: graph.getTestsForDiagnosis(r.diagnosis),
        treatments: graph.getTreatmentsForDiagnosis(r.diagnosis),
        redFlags: graph.getRedFlags(r.diagnosis),
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 10);
}

export function getKnowledgeGraph(): KnowledgeGraphEngine {
  return graph;
}
