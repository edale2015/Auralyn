/**
 * In-memory medical knowledge graph with a Neo4j-compatible API surface.
 * No external database required — fully in-process for Replit deployment.
 */

import type { GraphNode, GraphEdge } from "./schema";
import { NodeType, RelationType } from "./schema";

class MedicalGraphStore {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];

  // ── Write ──────────────────────────────────────────────────────────────────

  createNode(type: NodeType | string, name: string): void {
    if (!this.nodes.has(name)) {
      this.nodes.set(name, { type: type as NodeType, name });
    }
  }

  createRelation(
    from: string,
    to:   string,
    relation: RelationType | string,
    weight = 1.0
  ): void {
    const exists = this.edges.some(
      (e) => e.from === from && e.to === to && e.relation === relation
    );
    if (!exists) {
      this.edges.push({ from, to, relation, weight });
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  getNode(name: string): GraphNode | undefined {
    return this.nodes.get(name);
  }

  getRelated(name: string, relation?: string): string[] {
    return this.edges
      .filter((e) => e.from === name && (!relation || e.relation === relation))
      .map((e) => e.to);
  }

  getRelatedTo(name: string, relation?: string): string[] {
    return this.edges
      .filter((e) => e.to === name && (!relation || e.relation === relation))
      .map((e) => e.from);
  }

  allNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  allEdges(): GraphEdge[] {
    return [...this.edges];
  }

  nodeCount(): number { return this.nodes.size; }
  edgeCount(): number { return this.edges.length; }

  // ── Bulk seed ──────────────────────────────────────────────────────────────

  seed(data: { nodes: Array<{ type: string; name: string }>; edges: Array<{ from: string; to: string; relation: string; weight?: number }> }): void {
    for (const n of data.nodes) this.createNode(n.type, n.name);
    for (const e of data.edges)  this.createRelation(e.from, e.to, e.relation, e.weight ?? 1);
  }
}

export const graphStore = new MedicalGraphStore();

// ─── Seed clinical knowledge ────────────────────────────────────────────────
graphStore.seed({
  nodes: [
    // Diseases
    { type: NodeType.DISEASE,   name: "ACS"            },
    { type: NodeType.DISEASE,   name: "PE"             },
    { type: NodeType.DISEASE,   name: "Pneumonia"      },
    { type: NodeType.DISEASE,   name: "Sepsis"         },
    { type: NodeType.DISEASE,   name: "CHF"            },
    { type: NodeType.DISEASE,   name: "COPD"           },
    { type: NodeType.DISEASE,   name: "Influenza"      },
    { type: NodeType.DISEASE,   name: "COVID-19"       },
    { type: NodeType.DISEASE,   name: "Strep Throat"   },
    { type: NodeType.DISEASE,   name: "UTI"            },
    { type: NodeType.DISEASE,   name: "Appendicitis"   },
    { type: NodeType.DISEASE,   name: "Meningitis"     },
    // Symptoms
    { type: NodeType.SYMPTOM,   name: "chest pain"     },
    { type: NodeType.SYMPTOM,   name: "dyspnea"        },
    { type: NodeType.SYMPTOM,   name: "fever"          },
    { type: NodeType.SYMPTOM,   name: "cough"          },
    { type: NodeType.SYMPTOM,   name: "fatigue"        },
    { type: NodeType.SYMPTOM,   name: "confusion"      },
    { type: NodeType.SYMPTOM,   name: "tachycardia"    },
    { type: NodeType.SYMPTOM,   name: "hypotension"    },
    { type: NodeType.SYMPTOM,   name: "sore throat"    },
    { type: NodeType.SYMPTOM,   name: "nausea"         },
    { type: NodeType.SYMPTOM,   name: "rash"           },
    { type: NodeType.SYMPTOM,   name: "neck stiffness" },
    { type: NodeType.SYMPTOM,   name: "headache"       },
    // Signs
    { type: NodeType.SIGN,      name: "elevated troponin" },
    { type: NodeType.SIGN,      name: "low SpO2"           },
    { type: NodeType.SIGN,      name: "high WBC"           },
    // Tests
    { type: NodeType.TEST,      name: "ECG"            },
    { type: NodeType.TEST,      name: "Troponin"       },
    { type: NodeType.TEST,      name: "D-dimer"        },
    { type: NodeType.TEST,      name: "CXR"            },
    { type: NodeType.TEST,      name: "CBC"            },
    { type: NodeType.TEST,      name: "Blood culture"  },
    { type: NodeType.TEST,      name: "Rapid Strep"    },
    { type: NodeType.TEST,      name: "LP"             },
    // Treatments
    { type: NodeType.TREATMENT, name: "Aspirin"        },
    { type: NodeType.TREATMENT, name: "IV antibiotics" },
    { type: NodeType.TREATMENT, name: "O2 therapy"     },
    { type: NodeType.TREATMENT, name: "anticoagulation" },
    { type: NodeType.TREATMENT, name: "fluid resuscitation" },
    { type: NodeType.TREATMENT, name: "penicillin"     },
    // Risk Factors
    { type: NodeType.RISK_FACTOR, name: "DM"           },
    { type: NodeType.RISK_FACTOR, name: "HTN"          },
    { type: NodeType.RISK_FACTOR, name: "smoking"      },
    { type: NodeType.RISK_FACTOR, name: "obesity"      },
    { type: NodeType.RISK_FACTOR, name: "elderly"      },
  ],
  edges: [
    // Symptoms → Diseases (INDICATES)
    { from: "chest pain",    to: "ACS",        relation: RelationType.INDICATES, weight: 0.8 },
    { from: "chest pain",    to: "PE",         relation: RelationType.INDICATES, weight: 0.5 },
    { from: "dyspnea",       to: "CHF",        relation: RelationType.INDICATES, weight: 0.7 },
    { from: "dyspnea",       to: "PE",         relation: RelationType.INDICATES, weight: 0.6 },
    { from: "dyspnea",       to: "COPD",       relation: RelationType.INDICATES, weight: 0.6 },
    { from: "dyspnea",       to: "Pneumonia",  relation: RelationType.INDICATES, weight: 0.5 },
    { from: "fever",         to: "Pneumonia",  relation: RelationType.INDICATES, weight: 0.7 },
    { from: "fever",         to: "Sepsis",     relation: RelationType.INDICATES, weight: 0.8 },
    { from: "fever",         to: "Influenza",  relation: RelationType.INDICATES, weight: 0.6 },
    { from: "fever",         to: "COVID-19",   relation: RelationType.INDICATES, weight: 0.6 },
    { from: "cough",         to: "Pneumonia",  relation: RelationType.INDICATES, weight: 0.7 },
    { from: "cough",         to: "COVID-19",   relation: RelationType.INDICATES, weight: 0.5 },
    { from: "cough",         to: "COPD",       relation: RelationType.INDICATES, weight: 0.5 },
    { from: "confusion",     to: "Sepsis",     relation: RelationType.INDICATES, weight: 0.8 },
    { from: "confusion",     to: "Meningitis", relation: RelationType.INDICATES, weight: 0.7 },
    { from: "tachycardia",   to: "PE",         relation: RelationType.INDICATES, weight: 0.6 },
    { from: "tachycardia",   to: "Sepsis",     relation: RelationType.INDICATES, weight: 0.7 },
    { from: "hypotension",   to: "Sepsis",     relation: RelationType.INDICATES, weight: 0.9 },
    { from: "sore throat",   to: "Strep Throat",relation:RelationType.INDICATES, weight: 0.8 },
    { from: "neck stiffness",to: "Meningitis", relation: RelationType.INDICATES, weight: 0.9 },
    { from: "headache",      to: "Meningitis", relation: RelationType.INDICATES, weight: 0.5 },
    // Diseases → Tests (SUPPORTS)
    { from: "ACS",           to: "ECG",        relation: RelationType.SUPPORTS },
    { from: "ACS",           to: "Troponin",   relation: RelationType.SUPPORTS },
    { from: "PE",            to: "D-dimer",    relation: RelationType.SUPPORTS },
    { from: "Pneumonia",     to: "CXR",        relation: RelationType.SUPPORTS },
    { from: "Sepsis",        to: "Blood culture",relation:RelationType.SUPPORTS },
    { from: "Strep Throat",  to: "Rapid Strep",relation: RelationType.SUPPORTS },
    { from: "Meningitis",    to: "LP",         relation: RelationType.SUPPORTS },
    // Diseases → Treatments (TREATED_BY)
    { from: "ACS",           to: "Aspirin",           relation: RelationType.TREATED_BY },
    { from: "Sepsis",        to: "IV antibiotics",    relation: RelationType.TREATED_BY },
    { from: "Sepsis",        to: "fluid resuscitation",relation:RelationType.TREATED_BY },
    { from: "PE",            to: "anticoagulation",   relation: RelationType.TREATED_BY },
    { from: "Pneumonia",     to: "IV antibiotics",    relation: RelationType.TREATED_BY },
    { from: "Strep Throat",  to: "penicillin",        relation: RelationType.TREATED_BY },
    // Risk factors
    { from: "DM",            to: "ACS",        relation: RelationType.CAUSES },
    { from: "HTN",           to: "ACS",        relation: RelationType.CAUSES },
    { from: "smoking",       to: "ACS",        relation: RelationType.CAUSES },
    { from: "smoking",       to: "COPD",       relation: RelationType.CAUSES },
    { from: "obesity",       to: "CHF",        relation: RelationType.CAUSES },
  ],
});
