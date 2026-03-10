export type SkillRegistryRow = {
  skillId: string;
  skillName: string;
  category:
    | "intake"
    | "safety"
    | "questions"
    | "reasoning"
    | "output"
    | "outcomes"
    | "analytics"
    | "audit";
  description: string;
  engineType: "rules" | "hybrid" | "retrieval";
  safetyClass: "medium" | "high" | "critical";
  triggerType:
    | "always"
    | "after_modifiers"
    | "after_complaint"
    | "iterative"
    | "conditional"
    | "pre-final"
    | "post-final"
    | "pre-differential"
    | "final";
  enabled: boolean;
  version: string;
  productModule:
    | "Intake"
    | "Triage"
    | "Questioning"
    | "Reasoning"
    | "Output"
    | "Outcomes"
    | "Analytics"
    | "Audit";
  strategicNotes?: string;
};

export const SKILL_REGISTRY: SkillRegistryRow[] = [
  {
    skillId: "SK001",
    skillName: "collect_modifiers",
    category: "intake",
    description: "Collect universal modifiers and normalize them",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "always",
    enabled: true,
    version: "v1",
    productModule: "Intake",
    strategicNotes: "Run first",
  },
  {
    skillId: "SK002",
    skillName: "extract_med_to_condition_triggers",
    category: "intake",
    description: "Infer likely conditions and follow-up bundles from meds",
    engineType: "rules",
    safetyClass: "high",
    triggerType: "after_modifiers",
    enabled: true,
    version: "v1",
    productModule: "Intake",
  },
  {
    skillId: "SK003",
    skillName: "identify_chief_complaint",
    category: "intake",
    description: "Map narrative to complaint template",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "always",
    enabled: true,
    version: "v1",
    productModule: "Triage",
  },
  {
    skillId: "SK004",
    skillName: "normalize_patient_story",
    category: "intake",
    description: "Extract structured findings from transcript",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "after_complaint",
    enabled: true,
    version: "v1",
    productModule: "Triage",
  },
  {
    skillId: "SK005",
    skillName: "detect_red_flags",
    category: "safety",
    description: "Check complaint and modifiers for emergency red flags",
    engineType: "rules",
    safetyClass: "critical",
    triggerType: "always",
    enabled: true,
    version: "v1",
    productModule: "Triage",
  },
  {
    skillId: "SK006",
    skillName: "determine_disposition",
    category: "safety",
    description: "Assign level of care and urgency",
    engineType: "rules",
    safetyClass: "critical",
    triggerType: "pre-final",
    enabled: true,
    version: "v1",
    productModule: "Triage",
  },
  {
    skillId: "SK007",
    skillName: "generate_emergency_warning",
    category: "output",
    description: "Render emergency warning text",
    engineType: "rules",
    safetyClass: "critical",
    triggerType: "conditional",
    enabled: true,
    version: "v1",
    productModule: "Output",
  },
  {
    skillId: "SK008",
    skillName: "select_next_best_question",
    category: "questions",
    description: "Choose highest-yield next question",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "iterative",
    enabled: true,
    version: "v1",
    productModule: "Questioning",
  },
  {
    skillId: "SK009",
    skillName: "run_complaint_question_bundle",
    category: "questions",
    description: "Load complaint-specific core questions",
    engineType: "rules",
    safetyClass: "high",
    triggerType: "after_complaint",
    enabled: true,
    version: "v1",
    productModule: "Questioning",
  },
  {
    skillId: "SK010",
    skillName: "trigger_global_secondary_questions",
    category: "questions",
    description: "Trigger global follow-up bundles",
    engineType: "rules",
    safetyClass: "high",
    triggerType: "after_modifiers",
    enabled: true,
    version: "v1",
    productModule: "Questioning",
  },
  {
    skillId: "SK011",
    skillName: "generate_differential",
    category: "reasoning",
    description: "Produce ranked differential from structured data",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "pre-final",
    enabled: true,
    version: "v1",
    productModule: "Reasoning",
  },
  {
    skillId: "SK012",
    skillName: "score_differential_clusters",
    category: "reasoning",
    description: "Apply deterministic scoring to diagnosis clusters",
    engineType: "rules",
    safetyClass: "high",
    triggerType: "pre-differential",
    enabled: true,
    version: "v1",
    productModule: "Reasoning",
  },
  {
    skillId: "SK013",
    skillName: "apply_clinical_score",
    category: "reasoning",
    description: "Run formal clinical scores like Centor and Wells",
    engineType: "rules",
    safetyClass: "critical",
    triggerType: "conditional",
    enabled: true,
    version: "v1",
    productModule: "Reasoning",
  },
  {
    skillId: "SK014",
    skillName: "check_consistency_and_gaps",
    category: "audit",
    description: "Find contradictions and missing critical data",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "pre-final",
    enabled: true,
    version: "v1",
    productModule: "Audit",
  },
  {
    skillId: "SK015",
    skillName: "generate_assessment_plan",
    category: "output",
    description: "Produce final structured assessment and plan",
    engineType: "hybrid",
    safetyClass: "high",
    triggerType: "final",
    enabled: true,
    version: "v1",
    productModule: "Output",
  },
  {
    skillId: "SK016",
    skillName: "attach_outcome_stub",
    category: "outcomes",
    description: "Create placeholder for future outcome tracking",
    engineType: "rules",
    safetyClass: "high",
    triggerType: "post-final",
    enabled: true,
    version: "v1",
    productModule: "Outcomes",
  },
  {
    skillId: "SK017",
    skillName: "measure_workflow_value",
    category: "analytics",
    description: "Estimate physician time and workflow value created",
    engineType: "rules",
    safetyClass: "medium",
    triggerType: "post-final",
    enabled: true,
    version: "v1",
    productModule: "Analytics",
  },
  {
    skillId: "SK018",
    skillName: "generate_physician_review_packet",
    category: "output",
    description: "Create concise clinician sign-off bundle",
    engineType: "hybrid",
    safetyClass: "critical",
    triggerType: "post-final",
    enabled: true,
    version: "v1",
    productModule: "Output",
  },
];

export function getSkillByName(skillName: string): SkillRegistryRow | undefined {
  return SKILL_REGISTRY.find((s) => s.skillName === skillName && s.enabled);
}

export function getEnabledSkills(): SkillRegistryRow[] {
  return SKILL_REGISTRY.filter((s) => s.enabled);
}
