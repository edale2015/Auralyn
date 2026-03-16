export interface ArchitectureLayer {
  id: string;
  label: string;
  components: string[];
}

export interface SystemArchitecture {
  layers: ArchitectureLayer[];
  engineCount: number;
  agents: string[];
  dashboards: string[];
  apiSurfaces: number;
}

export function getSystemArchitecture(): SystemArchitecture {
  return {
    layers: [
      {
        id: "interfaces",
        label: "User Interfaces",
        components: ["Telegram Bot", "WhatsApp Integration", "Web Clinical Dashboard", "Patient Intake Portal", "Provider Case View"],
      },
      {
        id: "clinical_brain",
        label: "Clinical Brain",
        components: ["Adaptive Engine Router", "Unified Reasoning Engine", "Protocol Selector", "Clinical Brain Engine (25-step pipeline)", "Graph-Aware Question Engine"],
      },
      {
        id: "reasoning",
        label: "Reasoning Engines",
        components: ["Bayesian Differential Engine", "Case Similarity Engine", "Differential Ranking Engine", "Cluster Scoring Engine", "Confidence Calibration Engine", "Temporal Risk Engine"],
      },
      {
        id: "safety",
        label: "Safety Layer",
        components: ["Red Flag Engine", "Rare Disease Safety Net", "Conversation Safety Monitor", "Emergency Safety Engine", "Coercion Audit"],
      },
      {
        id: "knowledge",
        label: "Knowledge Layer",
        components: ["Clinical Knowledge Graph", "Protocol Registry", "Skill Graph", "Knowledge Expansion Agent", "Guideline Update Agent"],
      },
      {
        id: "personalization",
        label: "Personalization Layer",
        components: ["Patient Personalization Engine", "Tone Strategy Engine", "Risk Multiplier System"],
      },
      {
        id: "learning",
        label: "Learning Layer",
        components: ["Clinical Memory Engine", "Outcome Tracker", "Confidence Calibration Trainer", "Model Drift Detector", "Simulation Learning Bridge"],
      },
      {
        id: "simulation",
        label: "Simulation Layer",
        components: ["Simulation Lab", "Graph-Driven Simulation", "Clinical Scenario Generator", "Simulation Planner", "Protocol Benchmark Engine"],
      },
      {
        id: "improvement",
        label: "Improvement Layer",
        components: ["Graph Gap Detector", "Automated Improvement Engine (ACIE)", "Weakness Detector", "Multi-Case Pattern Detector", "Question Coverage Engine"],
      },
      {
        id: "observability",
        label: "Observability",
        components: ["Clinical Control Tower", "Engine Atlas Dashboard", "Engine Cost Optimizer", "Explainable AI Engine", "Runtime Analytics"],
      },
      {
        id: "integrations",
        label: "Integrations",
        components: ["eCW / Athena EHR", "GPT-4o (OpenAI)", "Firebase Firestore", "Google Sheets", "Twilio WhatsApp"],
      },
    ],
    engineCount: 135,
    agents: [
      "Clinical Brain Agent",
      "Conversation Agent",
      "Diagnostic Agent",
      "Learning Agent",
      "Simulation Agent",
      "Research Agent",
      "Improvement Agent",
      "Safety Agent",
    ],
    dashboards: [
      "Admin Dashboard",
      "Clinical Control Tower",
      "Engine Atlas",
      "Clinical Simulation Lab",
      "Clinical Knowledge Graph",
      "Physician Analytics",
    ],
    apiSurfaces: 18,
  };
}
