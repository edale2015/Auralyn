import { getKnowledgeGraph, getNodeById } from "./knowledgeGraphStore";

export function getNeighborhood(nodeId: string) {
  const graph = getKnowledgeGraph();
  const center = getNodeById(nodeId);
  if (!center) return null;

  const directEdges = graph.edges.filter(e => e.from === nodeId || e.to === nodeId);
  const neighborIds = new Set<string>();
  directEdges.forEach(edge => {
    if (edge.from !== nodeId) neighborIds.add(edge.from);
    if (edge.to !== nodeId) neighborIds.add(edge.to);
  });

  const neighbors = graph.nodes.filter(n => neighborIds.has(n.id));

  return { center, neighbors, edges: directEdges };
}

export function findComplaintPathway(complaintId: string) {
  const graph = getKnowledgeGraph();
  const complaint = graph.nodes.find(n => n.id === complaintId && n.type === "complaint");
  if (!complaint) return null;

  const skills = graph.edges
    .filter(e => e.from === complaintId && e.relation === "requires")
    .map(e => graph.nodes.find(n => n.id === e.to))
    .filter(Boolean);

  const questions = graph.edges
    .filter(e => e.from === complaintId && e.relation === "asks")
    .map(e => {
      const node = graph.nodes.find(n => n.id === e.to);
      return node ? { ...node, weight: e.weight ?? 0 } : null;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const protocols = graph.edges
    .filter(e => e.from === complaintId && e.relation === "governed_by")
    .map(e => graph.nodes.find(n => n.id === e.to))
    .filter(Boolean);

  const diagnoses = graph.edges
    .filter(e => e.from === complaintId && e.relation === "suggests")
    .map(e => {
      const node = graph.nodes.find(n => n.id === e.to);
      return node ? { ...node, weight: e.weight ?? 0 } : null;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const engineIds = new Set<string>();
  skills.forEach((skill: any) => {
    graph.edges
      .filter(e => e.from === skill.id && e.relation === "handled_by")
      .forEach(e => engineIds.add(e.to));
  });
  protocols.forEach((protocol: any) => {
    graph.edges
      .filter(e => e.from === protocol.id && e.relation === "handled_by")
      .forEach(e => engineIds.add(e.to));
  });

  const engines = graph.nodes.filter(n => engineIds.has(n.id));

  const dispositions = new Set<string>();
  diagnoses.forEach((dx: any) => {
    graph.edges
      .filter(e => e.from === dx.id && e.relation === "can_lead_to")
      .forEach(e => dispositions.add(e.to));
  });
  const dispositionNodes = graph.nodes.filter(n => dispositions.has(n.id));

  return { complaint, skills, questions, protocols, engines, diagnoses, dispositions: dispositionNodes };
}

export function searchKnowledgeGraph(term: string) {
  const graph = getKnowledgeGraph();
  const q = term.trim().toLowerCase();
  if (!q) return [];

  return graph.nodes.filter(node =>
    node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)
  );
}

export function getEscalationPaths() {
  const graph = getKnowledgeGraph();
  return graph.edges
    .filter(e => e.relation === "escalates_to")
    .map(e => ({
      symptom: graph.nodes.find(n => n.id === e.from),
      disposition: graph.nodes.find(n => n.id === e.to),
      weight: e.weight,
    }))
    .filter(p => p.symptom && p.disposition)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}
