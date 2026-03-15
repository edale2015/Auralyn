import type { DifferentialScore } from '../../shared/clinicalEngineTypes';

export interface PathNode {
  id: string;
  label: string;
  type: 'input' | 'symptom' | 'diagnosis' | 'test' | 'treatment' | 'disposition';
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PathEdge {
  from: string;
  to: string;
  weight: number;
  label?: string;
}

export interface ClinicalPathGraph {
  nodes: PathNode[];
  edges: PathEdge[];
  entryPoint: string;
  exitPoint: string;
}

export function clinicalPathVisualizer(
  symptoms: string[],
  differentials: DifferentialScore[],
  tests: string[],
  treatments: string[],
  disposition: string
): ClinicalPathGraph {
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];

  // ── Root symptom cluster ──────────────────────────────────────────────────
  nodes.push({ id: 'patient_input', label: 'Patient Presentation', type: 'input' });

  symptoms.slice(0, 8).forEach((symptom, i) => {
    const id = `sym_${i}`;
    nodes.push({ id, label: symptom.replace(/_/g, ' '), type: 'symptom' });
    edges.push({ from: 'patient_input', to: id, weight: 1.0 });
  });

  // ── Differential nodes + edges from symptoms ──────────────────────────────
  const symptomIds = symptoms.slice(0, 8).map((_, i) => `sym_${i}`);
  differentials.slice(0, 5).forEach((d, i) => {
    const dxId = `dx_${i}`;
    nodes.push({ id: dxId, label: d.diagnosis.replace(/_/g, ' '), type: 'diagnosis', score: d.score });
    symptomIds.forEach((symId) => {
      edges.push({ from: symId, to: dxId, weight: d.score });
    });
  });

  // ── Test nodes ────────────────────────────────────────────────────────────
  const topDx = differentials.slice(0, 2).map((_, i) => `dx_${i}`);
  tests.slice(0, 5).forEach((test, i) => {
    const testId = `test_${i}`;
    nodes.push({ id: testId, label: test, type: 'test' });
    topDx.forEach((dxId) => {
      edges.push({ from: dxId, to: testId, weight: 0.8 });
    });
  });

  // ── Treatment nodes ───────────────────────────────────────────────────────
  const testIds = tests.slice(0, 5).map((_, i) => `test_${i}`);
  treatments.slice(0, 4).forEach((tx, i) => {
    const txId = `tx_${i}`;
    nodes.push({ id: txId, label: tx, type: 'treatment' });
    (testIds.length ? testIds : topDx).forEach((srcId) => {
      edges.push({ from: srcId, to: txId, weight: 0.7 });
    });
  });

  // ── Disposition node ──────────────────────────────────────────────────────
  nodes.push({ id: 'disposition', label: disposition.replace(/_/g, ' '), type: 'disposition' });
  const lastLayerIds = treatments.length
    ? treatments.slice(0, 4).map((_, i) => `tx_${i}`)
    : topDx;
  lastLayerIds.forEach((srcId) => {
    edges.push({ from: srcId, to: 'disposition', weight: 1.0 });
  });

  return {
    nodes,
    edges,
    entryPoint: 'patient_input',
    exitPoint: 'disposition',
  };
}

export function toCytoscapeFormat(graph: ClinicalPathGraph) {
  return {
    nodes: graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, score: n.score } })),
    edges: graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.from, target: e.to, weight: e.weight, label: e.label } })),
  };
}

export function toMermaidFormat(graph: ClinicalPathGraph): string {
  const lines: string[] = ['graph LR'];
  const nodeLabels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const seen = new Set<string>();

  graph.nodes.forEach((n) => {
    const shape = n.type === 'input' ? `([${n.label}])` : n.type === 'diagnosis' ? `{${n.label}}` : n.type === 'disposition' ? `[[${n.label}]]` : `[${n.label}]`;
    lines.push(`  ${n.id}${shape}`);
  });

  graph.edges.forEach((e) => {
    const key = `${e.from}-->${e.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      const label = e.label ?? e.weight.toFixed(2);
      lines.push(`  ${e.from} -->|${label}| ${e.to}`);
    }
  });

  return lines.join('\n');
}
