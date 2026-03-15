import type { GraphEdge } from './graphDeduplicationEngine';

export interface KnowledgeGap {
  complaint: string;
  issue: string;
  edgeCount: number;
  severity: 'critical' | 'moderate' | 'low';
  suggestions: string[];
}

export interface KnowledgeGraph {
  edges: GraphEdge[];
  nodes?: string[];
}

const GAP_THRESHOLD_CRITICAL = 2;
const GAP_THRESHOLD_MODERATE = 5;

export function knowledgeGapEngine(
  graph: KnowledgeGraph,
  complaints: string[]
): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];

  for (const complaint of complaints) {
    const connected = graph.edges.filter(
      (e) => e.from === complaint || e.to === complaint
    );

    const edgeCount = connected.length;

    if (edgeCount < GAP_THRESHOLD_MODERATE) {
      const severity: 'critical' | 'moderate' | 'low' =
        edgeCount < GAP_THRESHOLD_CRITICAL ? 'critical' : 'moderate';

      const missingTypes = getMissingKnowledgeTypes(connected);

      gaps.push({
        complaint,
        issue: edgeCount === 0 ? 'no knowledge coverage' : 'low knowledge coverage',
        edgeCount,
        severity,
        suggestions: missingTypes,
      });
    }
  }

  return gaps.sort((a, b) => a.edgeCount - b.edgeCount);
}

function getMissingKnowledgeTypes(edges: GraphEdge[]): string[] {
  const relations = new Set(edges.map((e) => e.relation));
  const allRequired = [
    'differential_includes',
    'red_flag_triggers',
    'test_recommended',
    'treatment_includes',
    'disposition_suggests',
  ];
  return allRequired.filter((r) => !relations.has(r)).map((r) =>
    `Add edges for: ${r.replace(/_/g, ' ')}`
  );
}

export function graphCoverageScore(graph: KnowledgeGraph, complaints: string[]): number {
  if (complaints.length === 0) return 1.0;
  const gaps = knowledgeGapEngine(graph, complaints);
  const critical = gaps.filter((g) => g.severity === 'critical').length;
  const moderate = gaps.filter((g) => g.severity === 'moderate').length;
  const penalty = (critical * 0.15 + moderate * 0.05);
  return Math.max(0, 1.0 - penalty);
}
