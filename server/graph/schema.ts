export enum NodeType {
  DISEASE     = "disease",
  SYMPTOM     = "symptom",
  SIGN        = "sign",
  TEST        = "test",
  TREATMENT   = "treatment",
  RISK_FACTOR = "risk_factor",
  PATTERN     = "pattern",
}

export enum RelationType {
  CAUSES                = "CAUSES",
  INDICATES             = "INDICATES",
  ASSOCIATED_WITH       = "ASSOCIATED_WITH",
  TREATED_BY            = "TREATED_BY",
  CONTRAINDICATED_WITH  = "CONTRAINDICATED_WITH",
  SUPPORTS              = "SUPPORTS",
  RULE_TRIGGER          = "RULE_TRIGGER",
}

export interface GraphNode {
  type:  NodeType;
  name:  string;
}

export interface GraphEdge {
  from:     string;
  to:       string;
  relation: RelationType | string;
  weight:   number;
}
