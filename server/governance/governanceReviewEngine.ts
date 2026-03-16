export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface ReviewResult {
  risk: RiskLevel;
  reason: string;
  requiresPhysicianApproval: boolean;
  affectedSystems: string[];
  autoApprovable: boolean;
}

const SHEET_RISK_MAP: Record<string, ReviewResult> = {
  DISPOSITION_RULES: {
    risk: "critical",
    reason: "Disposition logic modified — triage outcomes may change for all patients",
    requiresPhysicianApproval: true,
    affectedSystems: ["triage_engine", "disposition_resolver", "safety_layer", "simulation_lab"],
    autoApprovable: false,
  },
  RED_FLAG_RULES: {
    risk: "critical",
    reason: "Safety rules modified — red flag detection and escalation affected",
    requiresPhysicianApproval: true,
    affectedSystems: ["red_flag_detector", "safety_layer", "escalation_engine"],
    autoApprovable: false,
  },
  COMPLAINT_REGISTRY: {
    risk: "high",
    reason: "Complaint definitions changed — routing, question flows, and graph structure affected",
    requiresPhysicianApproval: true,
    affectedSystems: ["complaint_router", "question_engine", "knowledge_graph"],
    autoApprovable: false,
  },
  CORE_QUESTIONS: {
    risk: "medium",
    reason: "Question flow changed — patient intake conversation affected",
    requiresPhysicianApproval: false,
    affectedSystems: ["question_engine", "adaptive_question_engine", "conversation_manager"],
    autoApprovable: false,
  },
  CLUSTER_SCORING_RULES: {
    risk: "medium",
    reason: "Scoring rules modified — diagnostic clustering and probabilistic reasoning affected",
    requiresPhysicianApproval: false,
    affectedSystems: ["cluster_scoring_engine", "probabilistic_reasoning"],
    autoApprovable: false,
  },
  OUTPUT_TEMPLATES: {
    risk: "low",
    reason: "Output templates updated — presentation layer only",
    requiresPhysicianApproval: false,
    affectedSystems: ["output_renderer"],
    autoApprovable: true,
  },
  GLOBAL_SECONDARY: {
    risk: "low",
    reason: "Secondary question data updated",
    requiresPhysicianApproval: false,
    affectedSystems: ["question_engine"],
    autoApprovable: true,
  },
};

export function reviewClinicalChange(change: { sheet: string; [key: string]: any }): ReviewResult {
  return (
    SHEET_RISK_MAP[change.sheet] ?? {
      risk: "low" as RiskLevel,
      reason: "Data update — no clinical impact expected",
      requiresPhysicianApproval: false,
      affectedSystems: [],
      autoApprovable: true,
    }
  );
}
