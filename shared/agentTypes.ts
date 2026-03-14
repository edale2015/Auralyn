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

  scoringSystems: z.array(z.object({
    scoreId: z.string(),
    name: z.string(),
    total: z.number(),
    category: z.string().optional(),
    criteriaFired: z.array(z.object({
      criterionId: z.string(),
      points: z.number(),
    })).default([]),
    templateId: z.string().optional(),
  })).default([]),

  redFlags: z.array(z.string()).default([]),

  // Clinical Brain Engine outputs
  similarity: z.any().optional(),
  differentials: z.array(z.any()).optional(),
  evidenceResults: z.array(z.any()).optional(),
  aggregatedDifferentials: z.array(z.any()).optional(),
  memoryCases: z.array(z.any()).optional(),
  contradictions: z.any().optional(),
  governance: z.any().optional(),
  nextBestQuestion: z.string().nullable().optional(),
  questionRankings: z.array(z.any()).optional(),
  safetyWarnings: z.array(z.any()).optional(),
  normalizedSymptoms: z.array(z.string()).optional(),
  safetyGuardTrigger: z.string().nullable().optional(),
  clinicalUncertainty: z.any().optional(),
  treatments: z.array(z.any()).optional(),
  tests: z.array(z.any()).optional(),
  returnPrecautions: z.array(z.any()).optional(),

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
    questionText: z.string().optional(),
    answered: z.boolean().default(false),
  })).default([]),

  metabolic: z.object({
    bmi: z.number().optional(),
    waist: z.number().optional(),
    eossStage: z.enum(["0", "1", "2", "3"]).optional(),
    weightTrend: z.enum(["gaining", "stable", "losing"]).optional(),
    goalType: z.enum(["weight_loss", "maintenance", "metabolic_health"]).optional(),
  }).optional(),

  dm: z.object({
    hasDM: z.boolean().optional(),
    type: z.enum(["type1", "type2", "gestational", "prediabetes"]).optional(),
    lastA1c: z.number().optional(),
    meds: z.array(z.string()).default([]),
    hypoHistory: z.boolean().optional(),
    ketoneRisk: z.boolean().optional(),
  }).optional(),

  htn: z.object({
    hasHTN: z.boolean().optional(),
    homeBP: z.string().optional(),
    meds: z.array(z.string()).default([]),
    bpToday: z.string().optional(),
    endOrganSymptoms: z.array(z.string()).default([]),
  }).optional(),

  bariatric: z.object({
    surgeryType: z.string().optional(),
    date: z.string().optional(),
    complicationsFlags: z.array(z.string()).default([]),
  }).optional(),

  glp1: z.object({
    agent: z.string().optional(),
    dose: z.string().optional(),
    escalationStage: z.number().optional(),
    sideEffects: z.array(z.string()).default([]),
  }).optional(),

  social: z.object({
    insuranceGap: z.boolean().optional(),
    pcpAccessDelay: z.boolean().optional(),
    pharmacyAccess: z.boolean().optional(),
  }).optional(),

  spotInterventions: z.array(z.object({
    interventionId: z.string(),
    contextCondition: z.string(),
    actions: z.array(z.string()).default([]),
    testsIfAvailable: z.array(z.string()).default([]),
    doNotDo: z.array(z.string()).default([]),
    referralWindow: z.string().optional(),
    erTriggers: z.array(z.string()).default([]),
    source: z.string().default("OBESITY_AGENT"),
    safetyClass: z.enum(["education", "test_suggestion", "spot_intervention", "er_send"]).default("education"),
  })).default([]),

  confidence: z.object({
    global: z.enum(["HIGH", "MODERATE", "LOW"]).default("MODERATE"),
    by_inference: z.array(z.object({
      itemType: z.string(),
      item: z.string(),
      confidence: z.enum(["HIGH", "MODERATE", "LOW"]),
      evidence: z.array(z.string()),
    })).default([]),
  }).optional(),

  careGaps: z.array(z.object({
    gap_id: z.string(),
    domain: z.string(),
    severity: z.enum(["INFO", "IMPORTANT", "URGENT_SOON"]),
    recommended_action: z.string(),
    evidence: z.array(z.string()),
  })).default([]),

  clinicalStateTrace: z.object({
    normalizedMeds: z.array(z.object({
      name: z.string(),
      source: z.string(),
    })).default([]),
    medGroups: z.array(z.object({
      group: z.string(),
      meds: z.array(z.string()),
      tableRowId: z.string().optional(),
    })).default([]),
    inferredConditions: z.array(z.object({
      condition: z.string(),
      confidence: z.string(),
      evidence: z.array(z.string()),
      triggerId: z.string().optional(),
    })).default([]),
    confirmedProblems: z.array(z.object({
      problem: z.string(),
      source: z.string(),
    })).default([]),
    riskFlags: z.array(z.object({
      flagId: z.string(),
      reason: z.string(),
      source: z.string(),
      severity: z.string().optional(),
    })).default([]),
    suggestedBundles: z.array(z.object({
      bundleId: z.string(),
      reason: z.string(),
      source: z.string(),
    })).default([]),
    triageHints: z.array(z.object({
      hint: z.string(),
      source: z.string(),
      clusterId: z.string().optional(),
    })).default([]),
    missingModifiers: z.array(z.object({
      modifierId: z.string(),
      label: z.string(),
      modifierSetId: z.string(),
    })).default([]),
    suggestedQuestions: z.array(z.object({
      questionId: z.string(),
      questionText: z.string(),
      bundleId: z.string().optional(),
      source: z.string(),
    })).default([]),
    tablesQueried: z.array(z.string()).default([]),
    buildDurationMs: z.number().optional(),
  }).optional(),

  redFlagGate: z.object({
    evaluated: z.boolean().default(false),
    flagsFound: z.array(z.object({
      flagId: z.string(),
      label: z.string(),
      severity: z.string(),
      action: z.string(),
      reasons: z.array(z.string()),
      immediateActions: z.array(z.string()),
      source: z.string(),
    })).default([]),
    gateResult: z.enum(["PASS", "ER_SEND", "ESCALATE"]).optional(),
    formattedOutput: z.record(z.any()).optional(),
  }).optional(),

  careMode: z.enum([
    "urgent_care",
    "family_medicine",
    "chronic_management",
    "specialty_program",
  ]).optional(),

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
    careSetting: z.string().optional(),
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
    type: z.literal("RESOLVE_DIAGNOSTICS"),
    system: z.string(),
    chiefComplaint: z.string(),
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
    type: z.literal("ASK_CLUSTER"),
    clusterId: z.string(),
    questions: z.array(z.string()).default([]),
  }),

  z.object({
    type: z.literal("EDUCATION_BLOCK"),
    topic: z.string(),
    content: z.string(),
    safetyClass: z.enum(["education", "test_suggestion", "spot_intervention", "er_send"]).default("education"),
  }),

  z.object({
    type: z.literal("TEST_SUGGESTION"),
    tests: z.array(z.string()),
    rationale: z.string(),
    urgency: z.enum(["stat", "routine", "if_available"]).default("routine"),
  }),

  z.object({
    type: z.literal("SAFETY_NET"),
    returnTriggers: z.array(z.string()),
    timeframe: z.string().optional(),
    instructions: z.array(z.string()).default([]),
  }),

  z.object({
    type: z.literal("REFERRAL_SUGGESTION"),
    specialty: z.string(),
    urgency: z.enum(["emergent", "urgent", "routine"]).default("routine"),
    reason: z.string(),
    timeframe: z.string().optional(),
  }),

  z.object({
    type: z.literal("ER_SEND_RECOMMENDATION"),
    reason: z.string(),
    immediateActions: z.array(z.string()).default([]),
    callEmergencyServices: z.boolean().default(false),
  }),

  z.object({
    type: z.literal("URGENT_CARE_SPOT_INTERVENTION"),
    interventionId: z.string(),
    contextCondition: z.string(),
    actions: z.array(z.string()).default([]),
    testsIfAvailable: z.array(z.string()).default([]),
    doNotDo: z.array(z.string()).default([]),
    referralWindow: z.string().optional(),
    safetyClass: z.enum(["education", "test_suggestion", "spot_intervention", "er_send"]).default("spot_intervention"),
  }),

  z.object({
    type: z.literal("SAFE_FREEFORM_EDUCATION"),
    topic: z.string(),
    content: z.string(),
    citedRecommendation: z.string(),
    safetyClass: z.literal("education").default("education"),
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
