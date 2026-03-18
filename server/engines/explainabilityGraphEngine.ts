export interface TraceNode {
  id: string;
  label: string;
  type: "input" | "engine" | "decision" | "output" | "safety" | "question" | "modifier" | "rule" | "cluster";
  duration?: number;
  color?: string;
}

export interface TraceEdge {
  source: string;
  target: string;
  label?: string;
}

export interface ExplainabilityGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
  totalSteps: number;
  totalDuration: number;
}

export interface ClinicalTrace {
  complaint: string;
  questions: Array<{ question: string; answer: string }>;
  modifiers: Array<{ name: string; effect: string }>;
  rules: Array<{ name: string; result: string }>;
  clusters: Array<{ name: string; score: number }>;
  diagnosis: string;
  triage: string;
}

export class ExplainabilityGraphEngine {
  build(trace: { layer: string; durationMs: number }[]): ExplainabilityGraph {
    const nodes: TraceNode[] = [];
    const edges: TraceEdge[] = [];

    const typeMap: Record<string, TraceNode["type"]> = {
      interface: "input", normalization: "input", state: "engine",
      knowledge: "engine", safety: "safety", reasoning: "engine",
      decision: "decision",
    };

    trace.forEach((step, i) => {
      nodes.push({ id: step.layer, label: step.layer.charAt(0).toUpperCase() + step.layer.slice(1), type: typeMap[step.layer] || "engine", duration: step.durationMs });
      if (i > 0) edges.push({ source: trace[i - 1].layer, target: step.layer, label: `${step.durationMs}ms` });
    });

    return { nodes, edges, totalSteps: trace.length, totalDuration: trace.reduce((s, t) => s + t.durationMs, 0) };
  }

  buildFromSteps(steps: string[]): ExplainabilityGraph {
    return this.build(steps.map((s) => ({ layer: s, durationMs: 0 })));
  }

  buildClinicalGraph(trace: ClinicalTrace): ExplainabilityGraph {
    const nodes: TraceNode[] = [];
    const edges: TraceEdge[] = [];

    nodes.push({ id: "complaint", label: trace.complaint.replace(/_/g, " "), type: "input", color: "#3b82f6" });

    trace.questions.forEach((q, i) => {
      const id = `q_${i}`;
      nodes.push({ id, label: `${q.question}: ${q.answer}`, type: "question", color: "#8b5cf6" });
      edges.push({ source: "complaint", target: id });
    });

    trace.modifiers.forEach((m, i) => {
      const id = `m_${i}`;
      nodes.push({ id, label: `Modifier: ${m.name} (${m.effect})`, type: "modifier", color: "#f59e0b" });
      edges.push({ source: "complaint", target: id });
    });

    trace.rules.forEach((r, i) => {
      const id = `r_${i}`;
      nodes.push({ id, label: `Rule: ${r.name} → ${r.result}`, type: "rule", color: "#ef4444" });
      edges.push({ source: "complaint", target: id });
    });

    trace.clusters.forEach((c, i) => {
      const id = `c_${i}`;
      nodes.push({ id, label: `${c.name} (${(c.score * 100).toFixed(0)}%)`, type: "cluster", color: "#10b981" });
      edges.push({ source: "complaint", target: id });
    });

    nodes.push({
      id: "final",
      label: `${trace.diagnosis} → ${trace.triage}`,
      type: "decision",
      color: "#dc2626",
    });

    for (let i = 0; i < trace.clusters.length; i++) {
      edges.push({ source: `c_${i}`, target: "final" });
    }
    for (let i = 0; i < trace.rules.length; i++) {
      edges.push({ source: `r_${i}`, target: "final" });
    }

    return {
      nodes,
      edges,
      totalSteps: nodes.length,
      totalDuration: 0,
    };
  }

  buildDemoGraph(): ExplainabilityGraph {
    return this.buildClinicalGraph({
      complaint: "chest_pain",
      questions: [
        { question: "Chest tightness?", answer: "Yes" },
        { question: "Shortness of breath?", answer: "Yes" },
        { question: "Pain radiates to arm?", answer: "No" },
        { question: "Sweating?", answer: "Yes" },
      ],
      modifiers: [
        { name: "Age > 50", effect: "+risk" },
        { name: "Smoker", effect: "+risk" },
      ],
      rules: [
        { name: "cardiac_risk_high", result: "escalate" },
        { name: "sob_with_chest_pain", result: "flag" },
      ],
      clusters: [
        { name: "ACS", score: 0.75 },
        { name: "GERD", score: 0.15 },
        { name: "Musculoskeletal", score: 0.10 },
      ],
      diagnosis: "Acute Coronary Syndrome",
      triage: "er_now",
    });
  }
}

export const explainabilityGraphEngine = new ExplainabilityGraphEngine();
