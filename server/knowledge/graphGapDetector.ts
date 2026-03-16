import { getKnowledgeGraph } from "./knowledgeGraphStore";

export interface GraphGap {
  nodeLabel: string;
  nodeId: string;
  nodeType: string;
  problem: string;
  severity: "critical" | "high" | "moderate" | "low";
  suggestion: string;
}

export function detectGraphGaps(): GraphGap[] {
  const graph = getKnowledgeGraph();
  const gaps: GraphGap[] = [];

  const complaints = graph.nodes.filter(n => n.type === "complaint");
  complaints.forEach(c => {
    const edges = graph.edges.filter(e => e.from === c.id);

    if (!edges.some(e => e.relation === "governed_by")) {
      gaps.push({
        nodeLabel: c.label, nodeId: c.id, nodeType: "complaint",
        problem: "missing_protocol",
        severity: "high",
        suggestion: `Add a clinical protocol mapping for "${c.label}"`,
      });
    }

    if (!edges.some(e => e.relation === "requires")) {
      gaps.push({
        nodeLabel: c.label, nodeId: c.id, nodeType: "complaint",
        problem: "missing_skill_mapping",
        severity: "high",
        suggestion: `Map clinical skills needed for "${c.label}" triage`,
      });
    }

    if (!edges.some(e => e.relation === "asks")) {
      gaps.push({
        nodeLabel: c.label, nodeId: c.id, nodeType: "complaint",
        problem: "no_questions_mapped",
        severity: "moderate",
        suggestion: `Add screening questions for "${c.label}"`,
      });
    }

    if (!edges.some(e => e.relation === "suggests")) {
      gaps.push({
        nodeLabel: c.label, nodeId: c.id, nodeType: "complaint",
        problem: "no_diagnoses_linked",
        severity: "moderate",
        suggestion: `Link differential diagnoses to "${c.label}"`,
      });
    }
  });

  const skills = graph.nodes.filter(n => n.type === "skill");
  skills.forEach(s => {
    if (!graph.edges.some(e => e.from === s.id && e.relation === "handled_by")) {
      gaps.push({
        nodeLabel: s.label, nodeId: s.id, nodeType: "skill",
        problem: "no_engine_assigned",
        severity: "critical",
        suggestion: `Assign an engine to handle "${s.label}"`,
      });
    }
  });

  const diagnoses = graph.nodes.filter(n => n.type === "diagnosis");
  diagnoses.forEach(d => {
    if (!graph.edges.some(e => e.from === d.id && e.relation === "can_lead_to")) {
      gaps.push({
        nodeLabel: d.label, nodeId: d.id, nodeType: "diagnosis",
        problem: "no_disposition_path",
        severity: "high",
        suggestion: `Map disposition path for "${d.label}"`,
      });
    }
  });

  return gaps;
}

export function getGapSummary() {
  const gaps = detectGraphGaps();
  const bySeverity: Record<string, number> = {};
  const byProblem: Record<string, number> = {};
  gaps.forEach(g => {
    bySeverity[g.severity] = (bySeverity[g.severity] ?? 0) + 1;
    byProblem[g.problem] = (byProblem[g.problem] ?? 0) + 1;
  });
  return { total: gaps.length, bySeverity, byProblem, gaps };
}
