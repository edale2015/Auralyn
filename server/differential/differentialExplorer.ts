import { getKnowledgeGraph } from "../knowledge/knowledgeGraphStore";

export interface DiagnosisNode {
  id: string;
  name: string;
  system: string;
  prevalence?: number;
}

export interface DiagnosisEdge {
  source: string;
  target: string;
  relationship: "overlap" | "rule_out" | "rule_in" | "co_occurrence";
  sharedSymptoms?: string[];
}

export interface DifferentialGraph {
  nodes: DiagnosisNode[];
  edges: DiagnosisEdge[];
  timestamp: number;
}

const DEFAULT_DIAGNOSES: DiagnosisNode[] = [
  { id: "uri", name: "Upper Respiratory Infection", system: "respiratory", prevalence: 0.35 },
  { id: "sinusitis", name: "Acute Sinusitis", system: "respiratory", prevalence: 0.15 },
  { id: "bronchitis", name: "Acute Bronchitis", system: "respiratory", prevalence: 0.12 },
  { id: "pneumonia", name: "Pneumonia", system: "respiratory", prevalence: 0.08 },
  { id: "influenza", name: "Influenza", system: "respiratory", prevalence: 0.10 },
  { id: "strep_pharyngitis", name: "Strep Pharyngitis", system: "ent", prevalence: 0.10 },
  { id: "otitis_media", name: "Acute Otitis Media", system: "ent", prevalence: 0.07 },
  { id: "allergic_rhinitis", name: "Allergic Rhinitis", system: "ent", prevalence: 0.20 },
  { id: "migraine", name: "Migraine", system: "neuro", prevalence: 0.06 },
  { id: "tension_headache", name: "Tension Headache", system: "neuro", prevalence: 0.15 },
  { id: "bppv", name: "BPPV (Vertigo)", system: "neuro", prevalence: 0.04 },
  { id: "covid", name: "COVID-19", system: "respiratory", prevalence: 0.05 },
  { id: "peritonsillar_abscess", name: "Peritonsillar Abscess", system: "ent", prevalence: 0.02 },
  { id: "epiglottitis", name: "Epiglottitis", system: "ent", prevalence: 0.01 },
  { id: "meningitis", name: "Meningitis", system: "neuro", prevalence: 0.005 },
];

const KNOWN_OVERLAPS: [string, string, string][] = [
  ["uri", "sinusitis", "overlap"],
  ["uri", "influenza", "overlap"],
  ["uri", "covid", "overlap"],
  ["uri", "allergic_rhinitis", "overlap"],
  ["bronchitis", "pneumonia", "overlap"],
  ["sinusitis", "allergic_rhinitis", "overlap"],
  ["migraine", "tension_headache", "overlap"],
  ["strep_pharyngitis", "peritonsillar_abscess", "rule_in"],
  ["pneumonia", "covid", "overlap"],
  ["otitis_media", "sinusitis", "co_occurrence"],
  ["bppv", "meningitis", "rule_out"],
  ["epiglottitis", "strep_pharyngitis", "rule_out"],
];

export class DifferentialDiagnosisExplorer {
  buildGraph(diagnoses?: DiagnosisNode[]): DifferentialGraph {
    const nodes = diagnoses?.length ? diagnoses : DEFAULT_DIAGNOSES;
    const edges: DiagnosisEdge[] = [];
    const nodeIds = new Set(nodes.map((n) => n.id));

    KNOWN_OVERLAPS.forEach(([src, tgt, rel]) => {
      if (nodeIds.has(src) && nodeIds.has(tgt)) {
        edges.push({ source: src, target: tgt, relationship: rel as any });
      }
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (
          nodes[i].system === nodes[j].system &&
          !edges.some(
            (e) =>
              (e.source === nodes[i].id && e.target === nodes[j].id) ||
              (e.source === nodes[j].id && e.target === nodes[i].id)
          )
        ) {
          edges.push({ source: nodes[i].id, target: nodes[j].id, relationship: "overlap" });
        }
      }
    }

    return { nodes, edges, timestamp: Date.now() };
  }

  buildGraphFromKnowledgeGraph(): DifferentialGraph {
    const kg = getKnowledgeGraph();
    const diagnosisNodes = kg.nodes
      .filter((n) => n.type === "diagnosis" || n.type === "complaint")
      .map((n) => ({
        id: n.id,
        name: n.label,
        system: n.type === "complaint" ? "complaint" : "diagnosis",
      }));

    return diagnosisNodes.length > 0 ? this.buildGraph(diagnosisNodes) : this.buildGraph();
  }
}

export const differentialExplorer = new DifferentialDiagnosisExplorer();
