export interface IntelligenceNode {
  id: string;
  type: "interface" | "agent" | "engine" | "knowledge" | "simulation" | "governance" | "integration" | "safety" | "learning";
  label: string;
  description: string;
  status: "active" | "monitoring" | "idle";
  apiEndpoint?: string;
}

export interface IntelligenceEdge {
  from: string;
  to: string;
  label?: string;
}

export const intelligenceGraph = {
  nodes: [
    { id: "whatsapp", type: "interface" as const, label: "WhatsApp Bot", description: "Patient intake via WhatsApp", status: "active" as const },
    { id: "telegram", type: "interface" as const, label: "Telegram Bot", description: "Patient intake via Telegram", status: "active" as const },
    { id: "web_dashboard", type: "interface" as const, label: "Web Dashboard", description: "Physician review & ops console", status: "active" as const },

    { id: "clinical_brain", type: "agent" as const, label: "Clinical Brain", description: "25-step reasoning pipeline orchestrator", status: "active" as const, apiEndpoint: "/api/brain" },
    { id: "adaptive_router", type: "engine" as const, label: "Adaptive Engine Router", description: "Selects optimal engine set per case", status: "active" as const },
    { id: "unified_reasoning", type: "engine" as const, label: "Unified Reasoning Engine", description: "Aggregates all engine outputs into final assessment", status: "active" as const },

    { id: "bayesian_diff", type: "engine" as const, label: "Bayesian Differential", description: "Probabilistic diagnostic reasoning", status: "active" as const },
    { id: "case_similarity", type: "engine" as const, label: "Case Similarity", description: "Matches against historical cases", status: "active" as const },
    { id: "red_flag", type: "safety" as const, label: "Red Flag Engine", description: "Critical symptom detection & escalation", status: "active" as const },
    { id: "cluster_scoring", type: "engine" as const, label: "Cluster Scoring", description: "Symptom cluster pattern analysis", status: "active" as const },
    { id: "confidence_cal", type: "engine" as const, label: "Confidence Calibration", description: "Calibrates diagnostic confidence", status: "active" as const },
    { id: "temporal_risk", type: "engine" as const, label: "Temporal Risk Engine", description: "Time-based risk progression analysis", status: "active" as const },
    { id: "protocol_selector", type: "engine" as const, label: "Protocol Selector", description: "Selects clinical protocols per diagnosis", status: "active" as const },
    { id: "disposition_resolver", type: "engine" as const, label: "Disposition Resolver", description: "Determines final triage disposition", status: "active" as const },
    { id: "symptom_normalizer", type: "engine" as const, label: "Symptom Normalizer", description: "Maps raw text to canonical symptoms", status: "active" as const },

    { id: "knowledge_graph", type: "knowledge" as const, label: "Clinical Knowledge Graph", description: "Complaint-symptom-diagnosis-protocol graph", status: "active" as const, apiEndpoint: "/knowledge-graph" },
    { id: "sheet_sync", type: "integration" as const, label: "Google Sheet Sync", description: "Syncs clinical rules from Google Sheets", status: "active" as const },
    { id: "schema_validator", type: "governance" as const, label: "Schema Validator", description: "4-layer workbook validation", status: "active" as const, apiEndpoint: "/schema-validator" },
    { id: "ingestion_pipeline", type: "integration" as const, label: "Sheet-to-Graph Pipeline", description: "Ingests validated sheets into knowledge graph", status: "active" as const },

    { id: "simulation_lab", type: "simulation" as const, label: "Simulation Lab", description: "Clinical scenario simulation engine", status: "active" as const, apiEndpoint: "/simulation-lab" },
    { id: "scenario_gen", type: "simulation" as const, label: "Scenario Generator", description: "Generates test cases from graph gaps", status: "active" as const },

    { id: "governance_queue", type: "governance" as const, label: "Governance Queue", description: "Clinical change approval workflow", status: "active" as const, apiEndpoint: "/clinical-governance" },
    { id: "version_control", type: "governance" as const, label: "Version Control", description: "Clinical configuration versioning", status: "active" as const, apiEndpoint: "/clinical-version-control" },
    { id: "audit_log", type: "governance" as const, label: "Audit Log", description: "Change tracking and impact analysis", status: "active" as const },
    { id: "regression_agent", type: "governance" as const, label: "Regression Agent", description: "Protocol regression testing", status: "monitoring" as const },

    { id: "safety_score", type: "safety" as const, label: "Safety Score Engine", description: "0-100 weighted clinical safety score", status: "active" as const },
    { id: "risk_monitor", type: "safety" as const, label: "Risk Monitor", description: "Clinical metric threshold monitoring", status: "monitoring" as const },
    { id: "consistency_engine", type: "safety" as const, label: "Consistency Engine", description: "Knowledge graph contradiction detection", status: "monitoring" as const },

    { id: "memory_engine", type: "learning" as const, label: "Clinical Memory", description: "Patient interaction history", status: "active" as const },
    { id: "personalization", type: "learning" as const, label: "Personalization Engine", description: "Adaptive patient interactions", status: "active" as const },
    { id: "research_agent", type: "learning" as const, label: "Research Agent", description: "Literature-based knowledge expansion", status: "idle" as const },
    { id: "feedback_agent", type: "learning" as const, label: "Physician Feedback", description: "Clinical correction loop", status: "active" as const },
  ] satisfies IntelligenceNode[],

  edges: [
    { from: "whatsapp", to: "clinical_brain" },
    { from: "telegram", to: "clinical_brain" },
    { from: "web_dashboard", to: "clinical_brain" },
    { from: "clinical_brain", to: "symptom_normalizer", label: "normalizes" },
    { from: "symptom_normalizer", to: "adaptive_router" },
    { from: "adaptive_router", to: "bayesian_diff", label: "selects" },
    { from: "adaptive_router", to: "case_similarity", label: "selects" },
    { from: "adaptive_router", to: "red_flag", label: "selects" },
    { from: "adaptive_router", to: "cluster_scoring", label: "selects" },
    { from: "adaptive_router", to: "temporal_risk", label: "selects" },
    { from: "bayesian_diff", to: "unified_reasoning" },
    { from: "case_similarity", to: "unified_reasoning" },
    { from: "red_flag", to: "unified_reasoning" },
    { from: "cluster_scoring", to: "unified_reasoning" },
    { from: "temporal_risk", to: "unified_reasoning" },
    { from: "confidence_cal", to: "unified_reasoning" },
    { from: "unified_reasoning", to: "protocol_selector" },
    { from: "protocol_selector", to: "disposition_resolver" },
    { from: "knowledge_graph", to: "adaptive_router", label: "provides context" },
    { from: "knowledge_graph", to: "bayesian_diff" },
    { from: "knowledge_graph", to: "protocol_selector" },
    { from: "sheet_sync", to: "schema_validator" },
    { from: "schema_validator", to: "ingestion_pipeline" },
    { from: "ingestion_pipeline", to: "knowledge_graph" },
    { from: "ingestion_pipeline", to: "governance_queue" },
    { from: "governance_queue", to: "version_control" },
    { from: "version_control", to: "audit_log" },
    { from: "simulation_lab", to: "scenario_gen" },
    { from: "knowledge_graph", to: "simulation_lab" },
    { from: "regression_agent", to: "simulation_lab" },
    { from: "safety_score", to: "risk_monitor" },
    { from: "consistency_engine", to: "knowledge_graph" },
    { from: "memory_engine", to: "personalization" },
    { from: "feedback_agent", to: "knowledge_graph", label: "corrections" },
    { from: "research_agent", to: "knowledge_graph", label: "expansion" },
  ] satisfies IntelligenceEdge[],
};

export function getIntelligenceMap() {
  return intelligenceGraph;
}
