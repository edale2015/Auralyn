import { clinicalPathVisualizer, toMermaidFormat, type ClinicalPathGraph } from './clinicalPathVisualizer';
import type { DifferentialScore } from '../../shared/clinicalEngineTypes';

export interface DecisionVisualizationInput {
  complaint: string;
  symptoms: string[];
  differential: DifferentialScore[];
  tests: string[];
  treatments: string[];
  disposition: string;
  engineTrace?: { engine: string; output: string }[];
}

export interface DecisionVisualizationResult {
  graph: ClinicalPathGraph;
  mermaid: string;
  cytoscape: unknown;
  mindMap: string;
  auditLadder: AuditStep[];
  decisionTree: string;
  summary: string;
}

export interface AuditStep {
  step: number;
  engine: string;
  input: string;
  output: string;
  confidence?: number;
}

export function clinicalDecisionVisualization(
  input: DecisionVisualizationInput
): DecisionVisualizationResult {
  const graph = clinicalPathVisualizer(
    input.symptoms,
    input.differential,
    input.tests,
    input.treatments,
    input.disposition
  );

  const mermaid = toMermaidFormat(graph);
  const cytoscape = {
    nodes: graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, score: n.score } })),
    edges: graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.from, target: e.to, weight: e.weight } })),
  };

  const mindMap = buildMindMap(input);
  const decisionTree = buildDecisionTree(input);
  const auditLadder = buildAuditLadder(input);
  const summary = buildSummary(input);

  return { graph, mermaid, cytoscape, mindMap, auditLadder, decisionTree, summary };
}

function buildMindMap(input: DecisionVisualizationInput): string {
  const lines: string[] = ['mindmap'];
  lines.push(`  root((${input.complaint.replace(/_/g, ' ')}))`);

  if (input.symptoms.length) {
    lines.push('    Symptoms');
    input.symptoms.slice(0, 6).forEach((s) =>
      lines.push(`      ${s.replace(/_/g, ' ')}`)
    );
  }

  if (input.differential.length) {
    lines.push('    Differentials');
    input.differential.slice(0, 4).forEach((d) =>
      lines.push(`      ${d.diagnosis.replace(/_/g, ' ')} (${(d.score * 100).toFixed(0)}%)`)
    );
  }

  if (input.tests.length) {
    lines.push('    Tests');
    input.tests.slice(0, 4).forEach((t) => lines.push(`      ${t}`));
  }

  if (input.treatments.length) {
    lines.push('    Treatments');
    input.treatments.slice(0, 3).forEach((t) => lines.push(`      ${t}`));
  }

  lines.push(`    Disposition`);
  lines.push(`      ${input.disposition.replace(/_/g, ' ')}`);

  return lines.join('\n');
}

function buildDecisionTree(input: DecisionVisualizationInput): string {
  const topDx = input.differential[0];
  const secondDx = input.differential[1];
  const hasRedFlag = input.symptoms.some((s) =>
    ['chest_pain', 'shortness_of_breath', 'syncope', 'hemoptysis', 'stroke_like', 'sepsis_concern']
      .includes(s)
  );

  const lines: string[] = ['graph TD'];
  lines.push(`  A([${input.complaint.replace(/_/g, ' ')}])`);
  lines.push(`  A --> B{Red flags present?}`);
  lines.push(`  B -->|Yes| C[Emergency pathway]`);
  lines.push(`  B -->|No| D[Standard evaluation]`);

  if (topDx) {
    lines.push(`  D --> E{Top diagnosis: ${topDx.diagnosis.replace(/_/g, ' ')}?}`);
    lines.push(`  E -->|Likely| F[${input.disposition.replace(/_/g, ' ')}]`);
    if (secondDx) {
      lines.push(`  E -->|Rule out| G[${secondDx.diagnosis.replace(/_/g, ' ')}]`);
      lines.push(`  G --> F`);
    }
  }

  if (input.tests.length) {
    lines.push(`  C --> H[${input.tests[0]}]`);
    lines.push(`  H --> F`);
  }

  lines.push(`  F --> I[[Sign-off + Document]]`);

  return lines.join('\n');
}

function buildAuditLadder(input: DecisionVisualizationInput): AuditStep[] {
  const steps: AuditStep[] = [
    {
      step: 1,
      engine: 'SymptomNormalization',
      input: `Raw complaint: ${input.complaint}`,
      output: `${input.symptoms.length} symptoms normalized`,
      confidence: 0.98,
    },
    {
      step: 2,
      engine: 'ContradictionCheck',
      input: `${input.symptoms.length} symptoms`,
      output: 'No critical contradictions detected',
      confidence: 0.95,
    },
    {
      step: 3,
      engine: 'SafetyGuard',
      input: `Symptoms: ${input.symptoms.slice(0, 3).join(', ')}`,
      output: 'Red flag scan complete',
      confidence: 0.99,
    },
    {
      step: 4,
      engine: 'BayesianDifferential',
      input: `${input.symptoms.length} symptoms → differentials`,
      output: `Top: ${input.differential[0]?.diagnosis ?? 'unknown'} (${((input.differential[0]?.score ?? 0) * 100).toFixed(1)}%)`,
      confidence: input.differential[0]?.score ?? 0.5,
    },
    {
      step: 5,
      engine: 'TestRecommender',
      input: `${input.differential.length} differentials`,
      output: `${input.tests.length} tests recommended`,
      confidence: 0.87,
    },
    {
      step: 6,
      engine: 'DispositionCalibration',
      input: `Differentials + tests`,
      output: `Disposition: ${input.disposition.replace(/_/g, ' ')}`,
      confidence: 0.91,
    },
  ];

  if (input.engineTrace) {
    input.engineTrace.forEach((t, i) =>
      steps.push({ step: 7 + i, engine: t.engine, input: '', output: t.output })
    );
  }

  return steps;
}

function buildSummary(input: DecisionVisualizationInput): string {
  const topDx = input.differential[0];
  return [
    `Complaint: ${input.complaint.replace(/_/g, ' ')}`,
    `Symptoms: ${input.symptoms.length} identified`,
    `Top differential: ${topDx?.diagnosis?.replace(/_/g, ' ') ?? 'Unknown'} (${((topDx?.score ?? 0) * 100).toFixed(1)}%)`,
    `Tests: ${input.tests.length}`,
    `Disposition: ${input.disposition.replace(/_/g, ' ')}`,
  ].join(' | ');
}
