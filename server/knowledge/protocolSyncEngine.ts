import { addKnowledgeEdge, addKnowledgeNode } from "./knowledgeGraphStore";

export function syncProtocols(protocolMap: Record<string, string>) {
  const synced: string[] = [];

  Object.entries(protocolMap).forEach(([complaint, protocol]) => {
    const complaintId = `complaint:${complaint}`;
    const protocolId = protocol.startsWith("protocol:") ? protocol : `protocol:${protocol}`;

    addKnowledgeNode({
      id: protocolId,
      type: "protocol",
      label: protocol.replace(/^protocol:/, "").replace(/_/g, " "),
    });

    addKnowledgeEdge({
      id: `psync_${complaint}`,
      from: complaintId,
      to: protocolId,
      relation: "governed_by",
      weight: 1,
    });

    synced.push(`${complaint} → ${protocolId}`);
  });

  return { synced, count: synced.length };
}
