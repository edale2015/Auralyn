import { addKnowledgeNode, addKnowledgeEdge, getKnowledgeGraph } from "./knowledgeGraphStore";
import { KnowledgeEdge } from "./knowledgeGraphTypes";

export interface KnowledgeExpansionUpdate {
  type: "new_diagnosis" | "new_symptom" | "new_question" | "new_skill" | "new_protocol";
  name: string;
  complaint?: string;
  relation?: KnowledgeEdge["relation"];
  metadata?: Record<string, any>;
}

const expansionLog: Array<{ update: KnowledgeExpansionUpdate; timestamp: string }> = [];

export function expandKnowledgeGraph(update: KnowledgeExpansionUpdate): { success: boolean; nodeId: string; edgeId?: string } {
  const nodeId = `${update.type.replace("new_", "")}:${update.name.toLowerCase().replace(/\s/g, "_")}`;

  const nodeType = update.type.replace("new_", "") as any;
  addKnowledgeNode({
    id: nodeId,
    type: nodeType,
    label: update.name,
    metadata: update.metadata,
  });

  let edgeId: string | undefined;
  if (update.complaint) {
    const defaultRelations: Record<string, KnowledgeEdge["relation"]> = {
      new_diagnosis: "suggests",
      new_symptom: "can_lead_to",
      new_question: "asks",
      new_skill: "requires",
      new_protocol: "governed_by",
    };
    const relation = update.relation ?? defaultRelations[update.type] ?? "suggests";
    const complaintId = `complaint:${update.complaint}`;
    const graph = getKnowledgeGraph();
    const complaintExists = graph.nodes.some(n => n.id === complaintId);
    if (!complaintExists) {
      addKnowledgeNode({ id: complaintId, type: "complaint", label: update.complaint.replace(/_/g, " ") });
    }
    edgeId = `expansion_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    addKnowledgeEdge({
      id: edgeId,
      from: complaintId,
      to: nodeId,
      relation,
    });
  }

  expansionLog.push({ update, timestamp: new Date().toISOString() });

  return { success: true, nodeId, edgeId };
}

export function getExpansionLog() {
  return expansionLog;
}

export function getExpansionStats() {
  const graph = getKnowledgeGraph();
  return {
    totalExpansions: expansionLog.length,
    currentNodes: graph.nodes.length,
    currentEdges: graph.edges.length,
    recentExpansions: expansionLog.slice(-10),
  };
}
