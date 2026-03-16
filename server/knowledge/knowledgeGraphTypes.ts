export type KnowledgeNodeType =
  | "complaint"
  | "symptom"
  | "question"
  | "skill"
  | "engine"
  | "diagnosis"
  | "protocol"
  | "disposition";

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  relation:
    | "requires"
    | "asks"
    | "handled_by"
    | "suggests"
    | "can_lead_to"
    | "governed_by"
    | "supports"
    | "escalates_to";
  weight?: number;
  metadata?: Record<string, any>;
}

export interface ClinicalKnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
