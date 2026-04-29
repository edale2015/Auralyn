/**
 * clinicalKnowledgeGraph.ts
 * server/reasoning/clinicalKnowledgeGraph.ts
 *
 * Symptoms as structured graph nodes rather than flat text tokens.
 * Typed edges encode clinical relationships: co-occurrence, supports/contradicts,
 * risk factors, red flag triggers. Cluster activation detects symptom patterns.
 * Missing findings are as informative as present ones.
 */

// ─── Graph node and edge types ────────────────────────────────────────────────

export type NodeType =
  | "symptom"
  | "diagnosis"
  | "risk_factor"
  | "red_flag"
  | "lab_finding"
  | "vital_sign"
  | "demographic";

export type EdgeType =
  | "strongly_supports"
  | "supports"
  | "weakly_supports"
  | "contradicts"
  | "strongly_contradicts"
  | "co_occurs_with"
  | "risk_factor_for"
  | "triggers_red_flag"
  | "requires_ruling_out";

export interface GraphNode {
  id:          string;
  type:        NodeType;
  label:       string;
  icdCode?:    string;
  observed?:   boolean;
  confidence?: number;
}

export interface GraphEdge {
  from:          string;
  to:            string;
  type:          EdgeType;
  weight:        number;
  evidenceBase?: string;
}

export interface SymptomCluster {
  id:               string;
  name:             string;
  nodes:            string[];
  threshold:        number;
  targetDx:         string;
  activated?:       boolean;
  activationScore?: number;
}

export interface GraphAnalysis {
  activatedClusters:   SymptomCluster[];
  redFlagPaths:        Array<{ path: string[]; urgency: "emergent" | "urgent" }>;
  geometricConfidence: number;
  supportingNodes:     GraphNode[];
  contradictingNodes:  GraphNode[];
  missingKeyFindings:  string[];
  clinicalPattern:     string;
}

// ─── Clinical knowledge graph ─────────────────────────────────────────────────

export class ClinicalKnowledgeGraph {
  private nodes:    Map<string, GraphNode> = new Map();
  private edges:    GraphEdge[]            = [];
  private clusters: SymptomCluster[]       = [];

  constructor(complaintSlug: string) {
    this.loadComplaintGraph(complaintSlug);
  }

  private loadComplaintGraph(slug: string): void {
    switch (slug) {
      case "chest_pain":          this.loadChestPainGraph();   break;
      case "sore_throat":         this.loadSoreThroatGraph();  break;
      case "shortness_of_breath": this.loadDyspneaGraph();     break;
      default:                    this.loadGenericGraph(slug); break;
    }
  }

  private addNode(node: GraphNode): void    { this.nodes.set(node.id, node); }
  private addEdge(edge: GraphEdge): void    { this.edges.push(edge); }
  private addCluster(c: SymptomCluster): void { this.clusters.push(c); }

  // ── Chest pain (HEART score + ACS pathways) ───────────────────────────────
  private loadChestPainGraph(): void {
    this.addNode({ id: "acs",   type: "diagnosis", label: "Acute Coronary Syndrome",   icdCode: "I21.9" });
    this.addNode({ id: "msk",   type: "diagnosis", label: "Musculoskeletal Chest Pain", icdCode: "M79.3" });
    this.addNode({ id: "gerd",  type: "diagnosis", label: "GERD/Esophageal",            icdCode: "K21.0" });
    this.addNode({ id: "pe",    type: "diagnosis", label: "Pulmonary Embolism",         icdCode: "I26.9" });
    this.addNode({ id: "pleur", type: "diagnosis", label: "Pleuritis",                 icdCode: "R09.1" });

    this.addNode({ id: "radiation_left",    type: "symptom", label: "Radiation to left arm/jaw" });
    this.addNode({ id: "diaphoresis",       type: "symptom", label: "Diaphoresis" });
    this.addNode({ id: "nausea",            type: "symptom", label: "Nausea/vomiting" });
    this.addNode({ id: "reproducible",      type: "symptom", label: "Reproducible with palpation" });
    this.addNode({ id: "pleuritic",         type: "symptom", label: "Pleuritic (worse with breathing)" });
    this.addNode({ id: "positional",        type: "symptom", label: "Positional (worse lying flat)" });
    this.addNode({ id: "substernal",        type: "symptom", label: "Substernal/crushing quality" });
    this.addNode({ id: "sudden_onset",      type: "symptom", label: "Sudden onset" });
    this.addNode({ id: "leg_swelling",      type: "symptom", label: "Unilateral leg swelling" });
    this.addNode({ id: "recent_immobility", type: "symptom", label: "Recent immobility/surgery" });

    this.addNode({ id: "known_cad",   type: "risk_factor", label: "Known CAD/prior MI" });
    this.addNode({ id: "diabetes",    type: "risk_factor", label: "Diabetes mellitus" });
    this.addNode({ id: "htn",         type: "risk_factor", label: "Hypertension" });
    this.addNode({ id: "smoking",     type: "risk_factor", label: "Current/former smoker" });
    this.addNode({ id: "age_over_65", type: "demographic", label: "Age > 65" });

    this.addNode({ id: "rf_acs", type: "red_flag", label: "ACS Red Flag" });
    this.addNode({ id: "rf_pe",  type: "red_flag", label: "PE Red Flag" });

    this.addEdge({ from: "radiation_left", to: "acs",  type: "strongly_supports",    weight: 0.85, evidenceBase: "HEART score" });
    this.addEdge({ from: "diaphoresis",    to: "acs",  type: "strongly_supports",    weight: 0.80 });
    this.addEdge({ from: "substernal",     to: "acs",  type: "supports",             weight: 0.70 });
    this.addEdge({ from: "nausea",         to: "acs",  type: "supports",             weight: 0.55 });
    this.addEdge({ from: "known_cad",      to: "acs",  type: "risk_factor_for",      weight: 0.75 });
    this.addEdge({ from: "diabetes",       to: "acs",  type: "risk_factor_for",      weight: 0.55 });
    this.addEdge({ from: "reproducible",   to: "acs",  type: "strongly_contradicts", weight: 0.80, evidenceBase: "Slipman 2000" });
    this.addEdge({ from: "positional",     to: "acs",  type: "contradicts",          weight: 0.65 });
    this.addEdge({ from: "pleuritic",      to: "acs",  type: "contradicts",          weight: 0.60 });

    this.addEdge({ from: "reproducible",      to: "msk", type: "strongly_supports", weight: 0.85 });
    this.addEdge({ from: "positional",        to: "msk", type: "supports",          weight: 0.60 });
    this.addEdge({ from: "pleuritic",         to: "pe",  type: "supports",          weight: 0.65, evidenceBase: "Wells criteria" });
    this.addEdge({ from: "sudden_onset",      to: "pe",  type: "supports",          weight: 0.60 });
    this.addEdge({ from: "leg_swelling",      to: "pe",  type: "strongly_supports", weight: 0.80 });
    this.addEdge({ from: "recent_immobility", to: "pe",  type: "risk_factor_for",   weight: 0.75 });

    this.addEdge({ from: "radiation_left", to: "rf_acs", type: "triggers_red_flag", weight: 1.0 });
    this.addEdge({ from: "diaphoresis",    to: "rf_acs", type: "triggers_red_flag", weight: 0.9 });
    this.addEdge({ from: "leg_swelling",   to: "rf_pe",  type: "triggers_red_flag", weight: 0.8 });

    this.addCluster({ id: "classic_acs", name: "Classic ACS Presentation",
      nodes: ["radiation_left", "diaphoresis", "substernal", "nausea"], threshold: 0.50, targetDx: "Acute Coronary Syndrome" });
    this.addCluster({ id: "msk_pattern", name: "Musculoskeletal Pattern",
      nodes: ["reproducible", "positional"], threshold: 0.50, targetDx: "Musculoskeletal Chest Pain" });
    this.addCluster({ id: "pe_pattern",  name: "PE Risk Pattern",
      nodes: ["pleuritic", "leg_swelling", "recent_immobility", "sudden_onset"], threshold: 0.50, targetDx: "Pulmonary Embolism" });
  }

  // ── Sore throat (Centor criteria) ─────────────────────────────────────────
  private loadSoreThroatGraph(): void {
    this.addNode({ id: "strep",   type: "diagnosis", label: "Group A Streptococcal Pharyngitis", icdCode: "J02.0" });
    this.addNode({ id: "viral",   type: "diagnosis", label: "Viral Pharyngitis",                 icdCode: "J02.9" });
    this.addNode({ id: "mono",    type: "diagnosis", label: "Infectious Mononucleosis",          icdCode: "B27.9" });
    this.addNode({ id: "abscess", type: "diagnosis", label: "Peritonsillar Abscess",             icdCode: "J36" });

    this.addNode({ id: "fever",     type: "symptom", label: "Fever > 38°C" });
    this.addNode({ id: "no_cough",  type: "symptom", label: "Absence of cough" });
    this.addNode({ id: "exudate",   type: "symptom", label: "Tonsillar exudate" });
    this.addNode({ id: "lymph",     type: "symptom", label: "Tender anterior cervical lymphadenopathy" });
    this.addNode({ id: "trismus",   type: "symptom", label: "Trismus (difficulty opening mouth)" });
    this.addNode({ id: "uvula_dev", type: "symptom", label: "Uvular deviation" });
    this.addNode({ id: "splenomeg", type: "symptom", label: "Splenomegaly" });

    this.addNode({ id: "rf_abscess", type: "red_flag", label: "Peritonsillar Abscess Red Flag" });

    this.addEdge({ from: "fever",    to: "strep",  type: "supports",          weight: 0.65, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "no_cough", to: "strep",  type: "strongly_supports", weight: 0.75, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "exudate",  to: "strep",  type: "strongly_supports", weight: 0.80, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "lymph",    to: "strep",  type: "supports",          weight: 0.70, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "fever",    to: "viral",  type: "weakly_supports",   weight: 0.40 });
    this.addEdge({ from: "no_cough", to: "viral",  type: "contradicts",       weight: 0.60 });
    this.addEdge({ from: "splenomeg", to: "mono",  type: "strongly_supports", weight: 0.85 });
    this.addEdge({ from: "lymph",     to: "mono",  type: "strongly_supports", weight: 0.75 });
    this.addEdge({ from: "trismus",   to: "abscess", type: "strongly_supports", weight: 0.90 });
    this.addEdge({ from: "uvula_dev", to: "abscess", type: "strongly_supports", weight: 0.88 });
    this.addEdge({ from: "trismus",   to: "rf_abscess", type: "triggers_red_flag", weight: 1.0 });
    this.addEdge({ from: "uvula_dev", to: "rf_abscess", type: "triggers_red_flag", weight: 1.0 });

    this.addCluster({ id: "centor_high", name: "High Centor Score (≥3)",
      nodes: ["fever", "no_cough", "exudate", "lymph"], threshold: 0.75, targetDx: "Group A Streptococcal Pharyngitis" });
  }

  // ── Dyspnea (simplified PE/AHF/asthma) ───────────────────────────────────
  private loadDyspneaGraph(): void {
    this.addNode({ id: "pe",     type: "diagnosis", label: "Pulmonary Embolism",   icdCode: "I26.9" });
    this.addNode({ id: "ahf",    type: "diagnosis", label: "Acute Heart Failure",  icdCode: "I50.9" });
    this.addNode({ id: "asthma", type: "diagnosis", label: "Asthma Exacerbation",  icdCode: "J45.901" });
    this.addNode({ id: "pleuritic", type: "symptom", label: "Pleuritic chest pain" });
    this.addNode({ id: "orthopnea", type: "symptom", label: "Orthopnea" });
    this.addNode({ id: "wheeze",    type: "symptom", label: "Wheeze" });
    this.addEdge({ from: "pleuritic", to: "pe",     type: "supports",          weight: 0.65 });
    this.addEdge({ from: "orthopnea", to: "ahf",    type: "strongly_supports", weight: 0.80 });
    this.addEdge({ from: "wheeze",    to: "asthma", type: "strongly_supports", weight: 0.85 });
  }

  private loadGenericGraph(_slug: string): void {
    this.addNode({ id: "undiff", type: "diagnosis", label: "Undifferentiated Complaint — requires clinical evaluation" });
  }

  addObservation(nodeId: string, present: boolean, confidence = 0.9): void {
    const node = this.nodes.get(nodeId);
    if (node) this.nodes.set(nodeId, { ...node, observed: present, confidence });
  }

  analyze(): GraphAnalysis {
    const activatedClusters = this.clusters.map(cluster => {
      const presentCount  = cluster.nodes.filter(nId => this.nodes.get(nId)?.observed === true).length;
      const score         = presentCount / cluster.nodes.length;
      return { ...cluster, activated: score >= cluster.threshold, activationScore: score };
    }).filter(c => c.activated);

    const redFlagPaths: Array<{ path: string[]; urgency: "emergent" | "urgent" }> = [];
    for (const edge of this.edges) {
      if (edge.type !== "triggers_red_flag") continue;
      const fromNode = this.nodes.get(edge.from);
      if (fromNode?.observed === true) {
        redFlagPaths.push({
          path:    [fromNode.label, this.nodes.get(edge.to)?.label ?? edge.to],
          urgency: "emergent",
        });
      }
    }

    const diagNodes = Array.from(this.nodes.values()).filter(n => n.type === "diagnosis");
    const topDx     = diagNodes[0]?.id ?? "";

    const supportingNodes = this.edges
      .filter(e => e.to === topDx &&
        (e.type === "strongly_supports" || e.type === "supports") &&
        this.nodes.get(e.from)?.observed === true)
      .map(e => this.nodes.get(e.from)!)
      .filter(Boolean);

    const contradictingNodes = this.edges
      .filter(e => e.to === topDx &&
        (e.type === "strongly_contradicts" || e.type === "contradicts") &&
        this.nodes.get(e.from)?.observed === true)
      .map(e => this.nodes.get(e.from)!)
      .filter(Boolean);

    const missingKeyFindings = this.edges
      .filter(e => e.type === "strongly_supports" &&
        e.weight >= 0.75 &&
        this.nodes.get(e.from)?.observed === undefined)
      .map(e => this.nodes.get(e.from)?.label ?? e.from)
      .slice(0, 3);

    const clusterBoost      = activatedClusters.length > 0 ? 0.15 : 0;
    const supportScore      = supportingNodes.reduce((sum, n) => {
      const edge = this.edges.find(e => e.from === n.id && e.to === topDx);
      return sum + (edge?.weight ?? 0);
    }, 0) / Math.max(supportingNodes.length, 1);
    const contradictPenalty  = contradictingNodes.length * 0.1;
    const geometricConfidence = Math.max(0, Math.min(1,
      0.5 + (supportScore * 0.35) + clusterBoost - contradictPenalty
    ));

    const clusterNames    = activatedClusters.map(c => c.name).join(", ");
    const clinicalPattern = clusterNames
      ? `Pattern consistent with: ${clusterNames}`
      : supportingNodes.length > 0
        ? `Supporting findings: ${supportingNodes.map(n => n.label).join(", ")}`
        : "Insufficient findings for pattern recognition";

    return {
      activatedClusters,
      redFlagPaths,
      geometricConfidence,
      supportingNodes,
      contradictingNodes,
      missingKeyFindings,
      clinicalPattern,
    };
  }
}
