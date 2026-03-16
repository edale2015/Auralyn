import { addKnowledgeEdge, addKnowledgeNode } from "./knowledgeGraphStore";

export function syncComplaintSkillsToGraph(
  complaint: string,
  skills: Array<{ id: string; label: string; priority?: string; engineIds?: string[] }>
) {
  const complaintId = `complaint:${complaint}`;

  addKnowledgeNode({
    id: complaintId,
    type: "complaint",
    label: complaint.replace(/_/g, " "),
  });

  skills.forEach((skill, idx) => {
    const skillId = skill.id.startsWith("skill:") ? skill.id : `skill:${skill.id}`;
    addKnowledgeNode({
      id: skillId,
      type: "skill",
      label: skill.label,
      metadata: { priority: skill.priority || "medium" },
    });

    addKnowledgeEdge({
      id: `sync_req_${complaint}_${idx}`,
      from: complaintId,
      to: skillId,
      relation: "requires",
      weight: 1,
    });

    (skill.engineIds || []).forEach((engineId, engineIdx) => {
      const fullEngineId = engineId.startsWith("engine:") ? engineId : `engine:${engineId}`;
      addKnowledgeNode({
        id: fullEngineId,
        type: "engine",
        label: engineId.replace(/^engine:/, ""),
      });

      addKnowledgeEdge({
        id: `sync_handled_${complaint}_${idx}_${engineIdx}`,
        from: skillId,
        to: fullEngineId,
        relation: "handled_by",
        weight: 0.9,
      });
    });
  });
}
