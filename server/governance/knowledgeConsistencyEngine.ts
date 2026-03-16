import { getKnowledgeGraph } from "../knowledge/knowledgeGraphStore";

export interface ConsistencyProblem {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

const DANGEROUS_SELF_CARE_LABELS = new Set([
  "acute coronary syndrome",
  "acs",
  "myocardial infarction",
  "heart attack",
  "stroke",
  "tia",
  "pulmonary embolism",
  "anaphylaxis",
  "meningitis",
  "sepsis",
  "aortic dissection",
  "ectopic pregnancy",
  "status epilepticus",
]);

export function checkKnowledgeConsistency(): {
  ok: boolean;
  problems: ConsistencyProblem[];
  checkedAt: string;
} {
  const graph = getKnowledgeGraph();
  const problems: ConsistencyProblem[] = [];

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  graph.edges.forEach((e) => {
    if (e.relation === "can_lead_to" && e.to.startsWith("disposition:")) {
      const dispLevel = e.to.replace("disposition:", "").toLowerCase();
      const sourceNode = graph.nodes.find((n) => n.id === e.from);

      if (
        (dispLevel === "self_care" || dispLevel === "self_care_ok") &&
        sourceNode &&
        DANGEROUS_SELF_CARE_LABELS.has(sourceNode.label.toLowerCase())
      ) {
        problems.push({
          severity: "critical",
          category: "dangerous_disposition",
          message: `"${sourceNode.label}" incorrectly mapped to self-care disposition`,
          nodeId: sourceNode.id,
          edgeId: e.id,
        });
      }
    }
  });

  graph.edges.forEach((e) => {
    if (!nodeIds.has(e.from) && !e.from.startsWith("skill:") && !e.from.startsWith("engine:")) {
      problems.push({
        severity: "high",
        category: "dangling_edge",
        message: `Edge "${e.id}" references non-existent source node "${e.from}"`,
        edgeId: e.id,
      });
    }
    if (!nodeIds.has(e.to) && !e.to.startsWith("skill:") && !e.to.startsWith("engine:") && !e.to.startsWith("disposition:")) {
      problems.push({
        severity: "high",
        category: "dangling_edge",
        message: `Edge "${e.id}" references non-existent target node "${e.to}"`,
        edgeId: e.id,
      });
    }
  });

  const complaintsWithoutQuestions = graph.nodes
    .filter((n) => n.type === "complaint")
    .filter((complaint) => !graph.edges.some((e) => e.from === complaint.id && e.relation === "asks"));

  complaintsWithoutQuestions.forEach((c) => {
    problems.push({
      severity: "medium",
      category: "incomplete_complaint",
      message: `Complaint "${c.label}" has no associated questions`,
      nodeId: c.id,
    });
  });

  const complaintsWithoutDisposition = graph.nodes
    .filter((n) => n.type === "complaint")
    .filter((complaint) => !graph.edges.some((e) => e.from === complaint.id && e.relation === "can_lead_to"));

  complaintsWithoutDisposition.forEach((c) => {
    problems.push({
      severity: "medium",
      category: "missing_disposition",
      message: `Complaint "${c.label}" has no disposition rules`,
      nodeId: c.id,
    });
  });

  const duplicateNodeIds = new Map<string, number>();
  graph.nodes.forEach((n) => {
    duplicateNodeIds.set(n.id, (duplicateNodeIds.get(n.id) ?? 0) + 1);
  });
  duplicateNodeIds.forEach((count, id) => {
    if (count > 1) {
      problems.push({
        severity: "medium",
        category: "duplicate_node",
        message: `Node "${id}" appears ${count} times in the graph`,
        nodeId: id,
      });
    }
  });

  return {
    ok: problems.filter((p) => p.severity === "critical" || p.severity === "high").length === 0,
    problems: problems.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
    checkedAt: new Date().toISOString(),
  };
}
