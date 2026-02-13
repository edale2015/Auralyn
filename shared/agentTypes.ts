import { z } from "zod";

/**
 * Canonical tri-state answer normalization
 */
export const AnswerValueSchema = z.union([
  z.literal("yes"),
  z.literal("no"),
  z.literal("not_sure"),
  z.number(),
  z.string(),
  z.null(),
]);

export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/**
 * CaseState is the single source of truth across live + test.
 * Persist this (Firestore) and update it step-by-step.
 */
export const CaseStateSchema = z.object({
  caseId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),

  chiefComplaint: z.string(),

  demographics: z.object({
    age: z.number().optional(),
    sex: z.enum(["male", "female", "other"]).optional(),
    pregnant: z.boolean().optional(),
  }).optional(),

  system: z.string().optional(),
  normalizedComplaint: z.string().optional(),

  modifiers: z.object({
    allergies: z.array(z.string()).optional(),
    pmh: z.array(z.string()).optional(),
    meds: z.array(z.string()).optional(),
    immunocompromised: z.boolean().optional(),
  }).optional(),

  modifierAnswers: z.record(z.union([z.string(), z.boolean(), z.number(), z.null()])).default({}),

  fhirPrefill: z.object({
    meds: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    problems: z.array(z.string()).default([]),
    vitalsSummary: z.string().optional(),
    derivedFlags: z.object({
      onAnticoagulant: z.boolean().default(false),
      hasAsthmaCOPD: z.boolean().default(false),
      immunosuppressed: z.boolean().default(false),
      pregnant: z.boolean().default(false),
      ckd: z.boolean().default(false),
      hepatic: z.boolean().default(false),
    }).default({}),
    provenance: z.array(z.object({
      resourceId: z.string(),
      resourceType: z.string(),
      lastUpdated: z.string().optional(),
    })).default([]),
  }).optional(),

  answers: z.record(AnswerValueSchema),

  scores: z.record(z.number()).default({}),
  activeClusters: z.array(z.string()).default([]),
  diagnosisClusterIds: z.array(z.string()).default([]),
  disposition: z.string().optional(),
  dispositionReasonCodes: z.array(z.string()).default([]),

  candidateMeds: z.array(z.object({
    medicationName: z.string(),
    medicationGroup: z.string().optional(),
    dose: z.string().optional(),
    route: z.string().optional(),
    reason: z.string().optional(),
    safetyNote: z.string().optional(),
    blocked: z.boolean().default(false),
    blockReason: z.string().optional(),
  })).default([]),

  candidateDiagnoses: z.array(z.object({
    diagnosisId: z.string(),
    diagnosisName: z.string().optional(),
    cluster: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
    dispositionSuggestion: z.string().optional(),
    reasoning: z.string().optional(),
  })).default([]),

  ruleTrace: z.array(z.object({
    ruleId: z.string(),
    triggerLevel: z.string(),
    action: z.string(),
    detail: z.string().optional(),
  })).default([]),

  redFlags: z.array(z.string()).default([]),
  requiredQuestionIdsMissing: z.array(z.string()).default([]),
  recommendedActions: z.array(z.object({
    type: z.string(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  })).default([]),

  questionQueue: z.array(z.object({
    questionId: z.string(),
    bundleId: z.string().optional(),
    askOrder: z.number().default(0),
    isRedFlag: z.boolean().default(false),
    answered: z.boolean().default(false),
  })).default([]),

  routing: z.object({
    state: z.enum([
      "INTAKE_PENDING",
      "MODIFIERS_PENDING",
      "CORE_QS_PENDING",
      "SCORING_PENDING",
      "DIFF_PENDING",
      "PLAN_DRAFTED",
      "REVIEW_REQUIRED",
      "EMERGENT_ESCALATION",
      "MORE_INFO_REQUIRED",
    ]).default("INTAKE_PENDING"),
    flowId: z.string().optional(),
    modifierSetId: z.string().optional(),
    primaryBundleId: z.string().optional(),
  }).default({ state: "INTAKE_PENDING" }),

  audit: z.object({
    steps: z.array(z.any()).default([]),
    events: z.array(z.any()).default([]),
  }).default({ steps: [], events: [] }),
});

export type CaseState = z.infer<typeof CaseStateSchema>;

/**
 * Constrained Action schema.
 * Router MUST only select from these actions.
 */
export const AgentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NOOP") }),

  z.object({
    type: z.literal("ASK_QUESTION"),
    questionId: z.string(),
    prompt: z.string().optional(),
  }),

  z.object({
    type: z.literal("COMPUTE_SCORE"),
    scoreType: z.enum(["centor"]),
  }),

  z.object({
    type: z.literal("FLAG_RED_FLAG"),
    flagId: z.string(),
    severity: z.enum(["hard", "soft"]).default("hard"),
    message: z.string().optional(),
  }),

  z.object({
    type: z.literal("SET_DISPOSITION"),
    disposition: z.string(),
    reasonCodes: z.array(z.string()).default([]),
  }),

  z.object({
    type: z.literal("ADD_DX"),
    clusterIds: z.array(z.string()),
  }),

  z.object({
    type: z.literal("RECOMMEND_ACTIONS"),
    actions: z.array(z.object({
      type: z.string(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
    })),
  }),

  z.object({
    type: z.literal("REFRAME_QUESTION"),
    questionId: z.string(),
    toneProfile: z.enum(["empathetic", "concise", "pediatric", "elderly"]).default("empathetic"),
    originalPrompt: z.string().optional(),
  }),

  z.object({
    type: z.literal("DRAFT_SUMMARY"),
    style: z.enum(["clinician", "patient"]).default("clinician"),
  }),

  z.object({
    type: z.literal("ESCALATE_TO_CLINICIAN"),
    reason: z.string(),
  }),

  z.object({
    type: z.literal("STOP"),
    stopReason: z.enum(["REVIEW_READY", "EMERGENT", "NEEDS_MORE_INFO", "MAX_STEPS"]),
  }),
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;

/**
 * Agent execution config (shared by live + regression).
 */
export const AgentRunConfigSchema = z.object({
  runId: z.string(),
  mode: z.enum(["REGRESSION", "LIVE"]).default("REGRESSION"),
  maxSteps: z.number().default(20),

  llm: z.object({
    enabled: z.boolean().default(true),
    temperature: z.number().default(0),
    seed: z.number().optional(),
    model: z.string().optional(),
    toneProfile: z.enum(["empathetic", "concise", "pediatric", "elderly"]).optional(),
  }).optional(),

  rules: z.object({
    spreadsheetIdOverride: z.string().nullable().optional(),
    sheetEnv: z.enum(["prod", "staging"]).default("staging"),
    rulesetHash: z.string().optional(),
  }).optional(),

  options: z.object({
    disableWrites: z.boolean().default(false),
    disableTwilio: z.boolean().default(false),
    disableFileUploads: z.boolean().default(false),
  }).optional(),
});

export type AgentRunConfig = z.infer<typeof AgentRunConfigSchema>;

/**
 * Router output: next action + rationale + missing inputs.
 */
export const NextActionResponseSchema = z.object({
  action: AgentActionSchema,
  rationale: z.string().optional(),
  requiredInputsMissing: z.array(z.string()).default([]),
});

export type NextActionResponse = z.infer<typeof NextActionResponseSchema>;
