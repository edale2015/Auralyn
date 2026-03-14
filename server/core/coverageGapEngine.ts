import type { ClinicalKnowledgeGraph } from "./knowledgeGraphExpansionEngine";
import { getNeighbors } from "./graphTraversalEngine";

export type CoverageGapOutput = {
  complaint: string;
  missingAreas: string[];
  score: number;
  detail: {
    differentialCount:  number;
    typicalSymptomCount: number;
    questionCount:      number;
    testCount:          number;
    treatmentCount:     number;
    redFlagCount:       number;
  };
};

export type CoverageReport = {
  timestamp: string;
  complaints: CoverageGapOutput[];
  averageScore: number;
  thinComplaints: string[];
};

/**
 * Assess how well a single complaint is covered by the knowledge graph.
 * Checks six areas: differentials, typical symptoms, confirmatory questions,
 * tests, treatments, and red flags.
 */
export function coverageGapEngine(
  graph: ClinicalKnowledgeGraph,
  complaint: string
): CoverageGapOutput {
  const missingAreas: string[] = [];

  // Wrapper so we can call getNeighbors with the flat graph
  function neighbors(nodeId: string, relation?: string): string[] {
    return getNeighbors(graph, nodeId, relation);
  }

  const differentials    = neighbors(complaint, "has_differential");
  const typicalSymptoms  = neighbors(complaint, "has_typical_symptom");

  let testCount      = 0;
  let treatmentCount = 0;
  let redFlagCount   = 0;
  let questionCount  = 0;

  for (const dx of differentials) {
    testCount      += neighbors(dx, "evaluated_by_test").length;
    treatmentCount += neighbors(dx, "treated_with").length;
    redFlagCount   += neighbors(dx, "has_red_flag").length;
    questionCount  += neighbors(dx, "confirmed_by_question").length;
  }

  if (differentials.length   === 0) missingAreas.push("no_differentials");
  if (typicalSymptoms.length  === 0) missingAreas.push("no_typical_symptoms");
  if (questionCount           === 0) missingAreas.push("no_confirmation_questions");
  if (testCount               === 0) missingAreas.push("no_tests");
  if (treatmentCount          === 0) missingAreas.push("no_treatments");
  if (redFlagCount            === 0) missingAreas.push("no_red_flags");

  const score = Math.max(0, 1 - missingAreas.length / 6);

  return {
    complaint,
    missingAreas,
    score,
    detail: {
      differentialCount:   differentials.length,
      typicalSymptomCount: typicalSymptoms.length,
      questionCount,
      testCount,
      treatmentCount,
      redFlagCount,
    },
  };
}

/**
 * Run coverage assessment across every complaint node in the graph.
 * Returns a full report sorted by score ascending (thinnest first).
 */
export function buildCoverageReport(graph: ClinicalKnowledgeGraph): CoverageReport {
  const complaintNodes = graph.nodes
    .filter((n) => n.type === "complaint")
    .map((n) => n.id);

  const complaints = complaintNodes
    .map((c) => coverageGapEngine(graph, c))
    .sort((a, b) => a.score - b.score);

  const averageScore =
    complaints.length > 0
      ? complaints.reduce((s, c) => s + c.score, 0) / complaints.length
      : 0;

  const thinComplaints = complaints
    .filter((c) => c.score < 0.5)
    .map((c) => c.complaint);

  return {
    timestamp: new Date().toISOString(),
    complaints,
    averageScore,
    thinComplaints,
  };
}
