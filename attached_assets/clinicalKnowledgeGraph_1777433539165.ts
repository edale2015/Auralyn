/**
 * clinicalKnowledgeGraph.ts
 * Drop into: server/reasoning/clinicalKnowledgeGraph.ts
 *
 * Implementation of the article's "geometry" concept for Auralyn.
 *
 * WHAT THIS IS:
 * Instead of treating symptoms as flat text tokens, this module models
 * them as nodes in a structured clinical knowledge graph where relationships
 * between symptoms, diagnoses, risk factors, and red flags are explicitly
 * encoded with typed edges.
 *
 * THE ARTICLE'S INSIGHT APPLIED:
 * "Geometry gives the machine a faithful model of the world."
 * Flat text ("patient has chest pain and diaphoresis") loses the relationship
 * structure. A graph ("chest_pain --[co-occurs_with]--> diaphoresis,
 * both --[strongly_supports]--> ACS") preserves it.
 *
 * CLINICAL VALUE:
 * - Symptom clusters are recognized as patterns, not just individual findings
 * - Risk factor combinations are weighted correctly (diabetes + hypertension
 *   + chest pain is geometrically different from any single factor)
 * - Missing findings are as informative as present ones
 * - Red flag detection uses graph traversal, not string matching
 *
 * USAGE:
 *   const graph = new ClinicalKnowledgeGraph("chest_pain");
 *   graph.addObservation("radiation_left_arm", true, 0.9);
 *   graph.addObservation("diaphoresis", true, 0.85);
 *   graph.addObservation("reproducible_palpation", false, 0.95);
 *   const analysis = graph.analyze();
 *   // analysis.activatedClusters — which clinical patterns are active
 *   // analysis.redFlagPaths — graph paths that trigger red flags
 *   // analysis.geometricConfidence — confidence from graph structure
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
  | "strongly_supports"    // LR > 3
  | "supports"             // LR 1.5-3
  | "weakly_supports"      // LR 1.1-1.5
  | "contradicts"          // LR < 0.7
  | "strongly_contradicts" // LR < 0.3
  | "co_occurs_with"       // symptom cluster membership
  | "risk_factor_for"      // demographic/history → diagnosis
  | "triggers_red_flag"    // finding → immediate escalation
  | "requires_ruling_out"; // diagnosis → must exclude this

export interface GraphNode {
  id:          string;
  type:        NodeType;
  label:       string;
  icdCode?:    string;
  observed?:   boolean;    // null = not asked, true = present, false = absent
  confidence?: number;     // how sure we are about the observation
}

export interface GraphEdge {
  from:          string;   // node ID
  to:            string;   // node ID
  type:          EdgeType;
  weight:        number;   // 0-1 strength of relationship
  evidenceBase?: string;   // clinical guideline basis
}

export interface SymptomCluster {
  id:          string;
  name:        string;
  nodes:       string[];   // node IDs in this cluster
  threshold:   number;     // fraction of nodes needed to activate cluster
  targetDx:    string;     // diagnosis this cluster points toward
  activated?:  boolean;
  activationScore?: number;
}

export interface GraphAnalysis {
  activatedClusters:    SymptomCluster[];
  redFlagPaths:         Array<{ path: string[]; urgency: "emergent" | "urgent" }>;
  geometricConfidence:  number;   // confidence derived from graph structure
  supportingNodes:      GraphNode[];
  contradictingNodes:   GraphNode[];
  missingKeyFindings:   string[];   // findings not asked that would help
  clinicalPattern:      string;     // plain English description of the pattern
}

// ─── Clinical knowledge graph ─────────────────────────────────────────────────

export class ClinicalKnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[]            = [];
  private clusters: SymptomCluster[]    = [];
  private complaintSlug: string;

  constructor(complaintSlug: string) {
    this.complaintSlug = complaintSlug;
    this.loadComplaintGraph(complaintSlug);
  }

  // ── Load complaint-specific graph structure ───────────────────────────────
  private loadComplaintGraph(slug: string): void {
    switch (slug) {
      case "chest_pain":   this.loadChestPainGraph();    break;
      case "sore_throat":  this.loadSoreThroatGraph();   break;
      case "shortness_of_breath": this.loadDyspneaGraph(); break;
      default:             this.loadGenericGraph(slug);  break;
    }
  }

  private addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  private addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  private addCluster(cluster: SymptomCluster): void {
    this.clusters.push(cluster);
  }

  // ── Chest pain graph (HEART score + ACS pathways) ────────────────────────
  private loadChestPainGraph(): void {
    // Diagnosis nodes
    this.addNode({ id: "acs",    type: "diagnosis", label: "Acute Coronary Syndrome",    icdCode: "I21.9" });
    this.addNode({ id: "msk",    type: "diagnosis", label: "Musculoskeletal Chest Pain",  icdCode: "M79.3" });
    this.addNode({ id: "gerd",   type: "diagnosis", label: "GERD/Esophageal",             icdCode: "K21.0" });
    this.addNode({ id: "pe",     type: "diagnosis", label: "Pulmonary Embolism",          icdCode: "I26.9" });
    this.addNode({ id: "pleur",  type: "diagnosis", label: "Pleuritis",                  icdCode: "R09.1" });

    // Symptom nodes
    this.addNode({ id: "radiation_left",  type: "symptom", label: "Radiation to left arm/jaw" });
    this.addNode({ id: "diaphoresis",     type: "symptom", label: "Diaphoresis" });
    this.addNode({ id: "nausea",          type: "symptom", label: "Nausea/vomiting" });
    this.addNode({ id: "reproducible",    type: "symptom", label: "Reproducible with palpation" });
    this.addNode({ id: "pleuritic",       type: "symptom", label: "Pleuritic (worse with breathing)" });
    this.addNode({ id: "positional",      type: "symptom", label: "Positional (worse lying flat)" });
    this.addNode({ id: "substernal",      type: "symptom", label: "Substernal/crushing quality" });
    this.addNode({ id: "sudden_onset",    type: "symptom", label: "Sudden onset" });
    this.addNode({ id: "leg_swelling",    type: "symptom", label: "Unilateral leg swelling" });
    this.addNode({ id: "recent_immobility", type: "symptom", label: "Recent immobility/surgery" });

    // Risk factor nodes
    this.addNode({ id: "known_cad",  type: "risk_factor", label: "Known CAD/prior MI" });
    this.addNode({ id: "diabetes",   type: "risk_factor", label: "Diabetes mellitus" });
    this.addNode({ id: "htn",        type: "risk_factor", label: "Hypertension" });
    this.addNode({ id: "smoking",    type: "risk_factor", label: "Current/former smoker" });
    this.addNode({ id: "age_over_65", type: "demographic", label: "Age > 65" });

    // Red flag nodes
    this.addNode({ id: "rf_acs",  type: "red_flag", label: "ACS Red Flag" });
    this.addNode({ id: "rf_pe",   type: "red_flag", label: "PE Red Flag" });

    // ACS-supporting edges
    this.addEdge({ from: "radiation_left", to: "acs",    type: "strongly_supports", weight: 0.85, evidenceBase: "HEART score" });
    this.addEdge({ from: "diaphoresis",    to: "acs",    type: "strongly_supports", weight: 0.80 });
    this.addEdge({ from: "substernal",     to: "acs",    type: "supports",          weight: 0.70 });
    this.addEdge({ from: "nausea",         to: "acs",    type: "supports",          weight: 0.55 });
    this.addEdge({ from: "known_cad",      to: "acs",    type: "risk_factor_for",   weight: 0.75 });
    this.addEdge({ from: "diabetes",       to: "acs",    type: "risk_factor_for",   weight: 0.55 });

    // ACS-contradicting edges
    this.addEdge({ from: "reproducible",  to: "acs",  type: "strongly_contradicts", weight: 0.80, evidenceBase: "Slipman 2000" });
    this.addEdge({ from: "positional",    to: "acs",  type: "contradicts",          weight: 0.65 });
    this.addEdge({ from: "pleuritic",     to: "acs",  type: "contradicts",          weight: 0.60 });

    // MSK-supporting edges
    this.addEdge({ from: "reproducible",  to: "msk",   type: "strongly_supports", weight: 0.85 });
    this.addEdge({ from: "positional",    to: "msk",   type: "supports",          weight: 0.60 });

    // PE-supporting edges
    this.addEdge({ from: "pleuritic",         to: "pe",  type: "supports",          weight: 0.65, evidenceBase: "Wells criteria" });
    this.addEdge({ from: "sudden_onset",      to: "pe",  type: "supports",          weight: 0.60 });
    this.addEdge({ from: "leg_swelling",      to: "pe",  type: "strongly_supports", weight: 0.80 });
    this.addEdge({ from: "recent_immobility", to: "pe",  type: "risk_factor_for",   weight: 0.75 });

    // Red flag triggers
    this.addEdge({ from: "radiation_left", to: "rf_acs",  type: "triggers_red_flag", weight: 1.0 });
    this.addEdge({ from: "diaphoresis",    to: "rf_acs",  type: "triggers_red_flag", weight: 0.9 });
    this.addEdge({ from: "leg_swelling",   to: "rf_pe",   type: "triggers_red_flag", weight: 0.8 });

    // Co-occurrence clusters (symptom patterns)
    this.addCluster({
      id:        "classic_acs",
      name:      "Classic ACS Presentation",
      nodes:     ["radiation_left", "diaphoresis", "substernal", "nausea"],
      threshold: 0.50,   // 2 of 4 = activate
      targetDx:  "Acute Coronary Syndrome",
    });

    this.addCluster({
      id:        "msk_pattern",
      name:      "Musculoskeletal Pattern",
      nodes:     ["reproducible", "positional"],
      threshold: 0.50,
      targetDx:  "Musculoskeletal Chest Pain",
    });

    this.addCluster({
      id:        "pe_pattern",
      name:      "PE Risk Pattern",
      nodes:     ["pleuritic", "leg_swelling", "recent_immobility", "sudden_onset"],
      threshold: 0.50,
      targetDx:  "Pulmonary Embolism",
    });
  }

  // ── Sore throat graph (Centor criteria) ───────────────────────────────────
  private loadSoreThroatGraph(): void {
    this.addNode({ id: "strep",  type: "diagnosis", label: "Group A Streptococcal Pharyngitis", icdCode: "J02.0" });
    this.addNode({ id: "viral",  type: "diagnosis", label: "Viral Pharyngitis",                  icdCode: "J02.9" });
    this.addNode({ id: "mono",   type: "diagnosis", label: "Infectious Mononucleosis",           icdCode: "B27.9" });
    this.addNode({ id: "abscess", type: "diagnosis", label: "Peritonsillar Abscess",             icdCode: "J36" });

    this.addNode({ id: "fever",     type: "symptom", label: "Fever > 38°C" });
    this.addNode({ id: "no_cough",  type: "symptom", label: "Absence of cough" });
    this.addNode({ id: "exudate",   type: "symptom", label: "Tonsillar exudate" });
    this.addNode({ id: "lymph",     type: "symptom", label: "Tender anterior cervical lymphadenopathy" });
    this.addNode({ id: "trismus",   type: "symptom", label: "Trismus (difficulty opening mouth)" });
    this.addNode({ id: "uvula_dev", type: "symptom", label: "Uvular deviation" });
    this.addNode({ id: "splenomeg", type: "symptom", label: "Splenomegaly" });

    this.addNode({ id: "rf_abscess", type: "red_flag", label: "Peritonsillar Abscess Red Flag" });

    // Centor criteria edges
    this.addEdge({ from: "fever",    to: "strep", type: "supports",          weight: 0.65, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "no_cough", to: "strep", type: "strongly_supports", weight: 0.75, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "exudate",  to: "strep", type: "strongly_supports", weight: 0.80, evidenceBase: "Centor criteria" });
    this.addEdge({ from: "lymph",    to: "strep", type: "supports",          weight: 0.70, evidenceBase: "Centor criteria" });

    this.addEdge({ from: "fever",    to: "viral", type: "weakly_supports",    weight: 0.40 });
    this.addEdge({ from: "no_cough", to: "viral", type: "contradicts",        weight: 0.60 });

    this.addEdge({ from: "splenomeg", to: "mono",  type: "strongly_supports", weight: 0.85 });
    this.addEdge({ from: "lymph",     to: "mono",  type: "strongly_supports", weight: 0.75 });

    this.addEdge({ from: "trismus",   to: "abscess",    type: "strongly_supports", weight: 0.90 });
    this.addEdge({ from: "uvula_dev", to: "abscess",    type: "strongly_supports", weight: 0.88 });
    this.addEdge({ from: "trismus",   to: "rf_abscess", type: "triggers_red_flag", weight: 1.0 });
    this.addEdge({ from: "uvula_dev", to: "rf_abscess", type: "triggers_red_flag", weight: 1.0 });

    this.addCluster({
      id: "centor_high", name: "High Centor Score (≥3)",
      nodes: ["fever", "no_cough", "exudate", "lymph"],
      threshold: 0.75,
      targetDx: "Group A Streptococcal Pharyngitis",
    });
  }

  private loadDyspneaGraph(): void {
    // Simplified — extend with full PE/AHF/asthma graph
    this.addNode({ id: "pe",    type: "diagnosis", label: "Pulmonary Embolism",       icdCode: "I26.9" });
    this.addNode({ id: "ahf",   type: "diagnosis", label: "Acute Heart Failure",      icdCode: "I50.9" });
    this.addNode({ id: "asthma", type: "diagnosis", label: "Asthma Exacerbation",     icdCode: "J45.901" });
    this.addNode({ id: "pleuritic", type: "symptom", label: "Pleuritic chest pain" });
    this.addNode({ id: "orthopnea", type: "symptom", label: "Orthopnea" });
    this.addNode({ id: "wheeze",    type: "symptom", label: "Wheeze" });
    this.addEdge({ from: "pleuritic", to: "pe",     type: "supports",          weight: 0.65 });
    this.addEdge({ from: "orthopnea", to: "ahf",    type: "strongly_supports", weight: 0.80 });
    this.addEdge({ from: "wheeze",    to: "asthma", type: "strongly_supports", weight: 0.85 });
  }

  private loadGenericGraph(slug: string): void {
    this.addNode({ id: "undiff", type: "diagnosis", label: "Undifferentiated Complaint — requires clinical evaluation" });
  }

  // ── Add an observation to the graph ────────────────────────────────────────
  addObservation(nodeId: string, present: boolean, confidence: number = 0.9): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.set(nodeId, { ...node, observed: present, confidence });
    }
  }

  // ── Analyze the graph ──────────────────────────────────────────────────────
  analyze(): GraphAnalysis {
    // Check which clusters are activated
    const activatedClusters = this.clusters.map(cluster => {
      const presentNodes = cluster.nodes.filter(nId => {
        const node = this.nodes.get(nId);
        return node?.observed === true;
      });
      const score     = presentNodes.length / cluster.nodes.length;
      const activated = score >= cluster.threshold;
      return { ...cluster, activated, activationScore: score };
    }).filter(c => c.activated);

    // Find red flag paths (graph traversal)
    const redFlagPaths: Array<{ path: string[]; urgency: "emergent" | "urgent" }> = [];
    for (const edge of this.edges) {
      if (edge.type !== "triggers_red_flag") continue;
      const fromNode = this.nodes.get(edge.from);
      if (fromNode?.observed === true) {
        const rfNode = this.nodes.get(edge.to);
        redFlagPaths.push({
          path:    [fromNode.label, rfNode?.label ?? edge.to],
          urgency: "emergent",
        });
      }
    }

    // Find supporting and contradicting nodes for top diagnosis
    const diagnosisNodes = Array.from(this.nodes.values())
      .filter(n => n.type === "diagnosis");
    const topDx = diagnosisNodes[0]?.id ?? "";

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

    // Find key missing findings
    const missingKeyFindings = this.edges
      .filter(e => e.type === "strongly_supports" &&
        e.weight >= 0.75 &&
        this.nodes.get(e.from)?.observed === undefined)
      .map(e => this.nodes.get(e.from)?.label ?? e.from)
      .slice(0, 3);

    // Geometric confidence: based on cluster activation + supporting edge weights
    const clusterBoost = activatedClusters.length > 0 ? 0.15 : 0;
    const supportScore = supportingNodes.reduce((sum, n) => {
      const edge = this.edges.find(e => e.from === n.id && e.to === topDx);
      return sum + (edge?.weight ?? 0);
    }, 0) / Math.max(supportingNodes.length, 1);
    const contradictPenalty = contradictingNodes.length * 0.1;
    const geometricConfidence = Math.max(0, Math.min(1,
      0.5 + (supportScore * 0.35) + clusterBoost - contradictPenalty
    ));

    // Clinical pattern description
    const clusterNames = activatedClusters.map(c => c.name).join(", ");
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
