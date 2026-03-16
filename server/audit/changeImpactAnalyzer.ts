import { ChangeRecord } from "./clinicalChangeAuditLog";

export type ImpactSeverity = "critical" | "high" | "medium" | "low";

export interface ChangeImpact {
  severity: ImpactSeverity;
  impact: string;
  affectedSystems: string[];
}

const SHEET_IMPACT_MAP: Record<string, ChangeImpact> = {
  DISPOSITION_RULES: {
    severity: "critical",
    impact: "Triage logic modified — disposition outcomes may change",
    affectedSystems: ["triage_engine", "disposition_resolver", "safety_layer"],
  },
  RED_FLAG_RULES: {
    severity: "critical",
    impact: "Safety rules modified — red flag detection affected",
    affectedSystems: ["red_flag_detector", "safety_layer", "escalation_engine"],
  },
  COMPLAINT_REGISTRY: {
    severity: "high",
    impact: "Complaint definitions changed — routing and question flows affected",
    affectedSystems: ["complaint_router", "question_engine", "knowledge_graph"],
  },
  CORE_QUESTIONS: {
    severity: "medium",
    impact: "Question flow changed — patient intake affected",
    affectedSystems: ["question_engine", "adaptive_question_engine"],
  },
  CLUSTER_SCORING_RULES: {
    severity: "medium",
    impact: "Scoring rules modified — diagnostic clustering affected",
    affectedSystems: ["cluster_scoring_engine", "probabilistic_reasoning"],
  },
  OUTPUT_TEMPLATES: {
    severity: "low",
    impact: "Output templates updated — presentation changes only",
    affectedSystems: ["output_renderer"],
  },
  GLOBAL_SECONDARY: {
    severity: "low",
    impact: "Secondary question data updated",
    affectedSystems: ["question_engine"],
  },
};

export function analyzeChangeImpact(change: ChangeRecord): ChangeImpact {
  return (
    SHEET_IMPACT_MAP[change.sheet] ?? {
      severity: "low" as ImpactSeverity,
      impact: "Data update",
      affectedSystems: [],
    }
  );
}

export function analyzeIngestionImpact(counts: Record<string, number>): ChangeImpact[] {
  const impacts: ChangeImpact[] = [];

  if (counts.dispositions > 0) impacts.push(SHEET_IMPACT_MAP.DISPOSITION_RULES);
  if (counts.redFlags > 0) impacts.push(SHEET_IMPACT_MAP.RED_FLAG_RULES);
  if (counts.complaints > 0) impacts.push(SHEET_IMPACT_MAP.COMPLAINT_REGISTRY);
  if (counts.questions > 0) impacts.push(SHEET_IMPACT_MAP.CORE_QUESTIONS);
  if (counts.clusterScoring > 0) impacts.push(SHEET_IMPACT_MAP.CLUSTER_SCORING_RULES);
  if (counts.templates > 0) impacts.push(SHEET_IMPACT_MAP.OUTPUT_TEMPLATES);

  return impacts;
}
