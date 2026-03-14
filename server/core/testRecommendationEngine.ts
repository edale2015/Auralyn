import KnowledgeGraphEngine from "./knowledgeGraphEngine";
import { clinicalEdges } from "../data/clinicalKnowledgeGraph";

const graph = new KnowledgeGraphEngine(clinicalEdges);

export interface TestRecommendation {
  diagnosis: string;
  tests: string[];
  priority: "urgent" | "routine";
}

const URGENT_TESTS = new Set([
  "ecg", "troponin", "ctpa", "ddimer", "ct_head", "lumbar_puncture",
  "blood_cultures", "lactate", "beta_hcg", "testicular_ultrasound",
  "pelvic_ultrasound", "intraocular_pressure",
]);

export function recommendTests(dx: string): string[] {
  return graph.getTestsForDiagnosis(dx);
}

export function getTestRecommendations(dx: string): TestRecommendation {
  const tests = graph.getTestsForDiagnosis(dx);
  const hasUrgent = tests.some((t) => URGENT_TESTS.has(t));
  return {
    diagnosis: dx,
    tests,
    priority: hasUrgent ? "urgent" : "routine",
  };
}

export function prioritizeTests(
  differentials: Array<{ diagnosis?: string; clusterId?: string; posteriorProbability?: number }>
): Array<{ test: string; priority: "urgent" | "routine"; supportingDx: string[] }> {
  const testMap: Record<string, { count: number; urgent: boolean; dx: string[] }> = {};

  for (const d of differentials.slice(0, 5)) {
    const dxId = d.diagnosis ?? d.clusterId ?? "";
    if (!dxId) continue;
    const tests = graph.getTestsForDiagnosis(dxId);
    for (const t of tests) {
      if (!testMap[t]) testMap[t] = { count: 0, urgent: false, dx: [] };
      testMap[t].count++;
      testMap[t].dx.push(dxId);
      if (URGENT_TESTS.has(t)) testMap[t].urgent = true;
    }
  }

  return Object.entries(testMap)
    .sort((a, b) => {
      if (a[1].urgent !== b[1].urgent) return a[1].urgent ? -1 : 1;
      return b[1].count - a[1].count;
    })
    .map(([test, meta]) => ({
      test,
      priority: meta.urgent ? "urgent" : "routine",
      supportingDx: meta.dx,
    }));
}
