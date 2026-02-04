import { z } from "zod";

export const TestCaseV1Schema = z.object({
  id: z.string(),
  label: z.string(),
  chiefComplaint: z.string(),
  case: z.object({
    demographics: z.object({
      age: z.number(),
      sex: z.enum(["male", "female", "other"]),
      pregnant: z.boolean().optional(),
    }),
    modifiers: z.record(z.unknown()).optional(),
    answers: z.record(z.union([z.literal("yes"), z.literal("no"), z.literal("not_sure"), z.number(), z.string(), z.null()])),
    files: z.array(z.object({
      name: z.string(),
      mime: z.string(),
      size: z.number(),
    })).optional(),
  }),
  expected: z.object({
    disposition: z.string().optional(),
    redFlagsPresent: z.array(z.string()).optional(),
    scores: z.record(z.number()).optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
});

export type TestCaseV1 = z.infer<typeof TestCaseV1Schema>;

export const AgentRunRequestSchema = z.object({
  case: z.object({
    chiefComplaint: z.string(),
    demographics: z.object({
      age: z.number().optional(),
      sex: z.enum(["male", "female", "other"]).optional(),
      pregnant: z.boolean().optional(),
    }).optional(),
    modifiers: z.object({
      allergies: z.array(z.string()).optional(),
      pmh: z.array(z.string()).optional(),
      meds: z.array(z.string()).optional(),
      immunocompromised: z.boolean().optional(),
    }).optional(),
    answers: z.record(z.union([
      z.literal("Yes"), z.literal("No"), z.literal("Not sure"),
      z.literal("yes"), z.literal("no"), z.literal("not_sure"),
      z.number(), z.string()
    ])),
    files: z.array(z.object({
      name: z.string(),
      mime: z.string(),
      size: z.number(),
    })).optional(),
  }),
  run: z.object({
    runId: z.string(),
    mode: z.enum(["REGRESSION", "LIVE"]).default("REGRESSION"),
    maxSteps: z.number().default(20),
    llm: z.object({
      enabled: z.boolean().default(true),
      temperature: z.number().default(0),
      seed: z.number().optional(),
      model: z.string().optional(),
    }).optional(),
    rules: z.object({
      spreadsheetIdOverride: z.string().nullable().optional(),
      sheetEnv: z.enum(["prod", "staging"]).default("staging"),
      rulesetHash: z.string().optional(),
    }).optional(),
    options: z.object({
      disableWrites: z.boolean().default(true),
      disableTwilio: z.boolean().default(true),
      disableFileUploads: z.boolean().default(true),
    }).optional(),
  }),
});

export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export type TraceStep = {
  step: number;
  actor: string;
  action: { type: string; [key: string]: unknown };
  inputsUsed: string[];
  outputs: Record<string, unknown>;
  ruleRefs: string[];
};

export type TraceEvent = {
  type: string;
  ruleId?: string;
  severity: "info" | "warn" | "error";
  message?: string;
};

export type NormalizedResult = {
  disposition: string;
  dx: string[];
  scores: Record<string, number>;
  redFlags: string[];
};

export type AgentRunResponse = {
  runId: string;
  env: {
    sheetEnv: string;
    commit: string;
    rulesetHash: string;
  };
  result: {
    disposition: string;
    dispositionReasonCodes: string[];
    diagnosisClusterIds: string[];
    scores: Record<string, number>;
    recommendedActions: Array<{ type: string; priority: string }>;
  };
  trace: {
    steps: TraceStep[];
    events: TraceEvent[];
  };
  normalized: {
    final: NormalizedResult;
    hash: string;
  };
};

export type RulesSnapshotTab = {
  name: string;
  rows: number;
  hash: string;
};

export type RulesSnapshotResponse = {
  sheetEnv: string;
  spreadsheetId: string;
  rulesetHash: string;
  tabs: RulesSnapshotTab[];
};

export const CompareRequestSchema = z.object({
  baseline: z.any(),
  candidate: z.any(),
  policy: z.object({
    hardFails: z.array(z.string()).default([
      "DISPOSITION_CHANGED_UP",
      "RED_FLAG_REMOVED",
      "ANTIBIOTIC_RECOMMENDATION_CHANGED",
    ]),
    softFails: z.array(z.string()).default([
      "DX_CHANGED",
      "QUESTION_ORDER_CHANGED",
    ]),
    allowLists: z.object({
      dxReorderOk: z.boolean().default(true),
      traceStepCountDeltaMax: z.number().default(3),
    }).optional(),
  }).optional(),
});

export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export type CompareFailure = {
  code: string;
  path: string;
  details?: string;
  baseline?: unknown;
  candidate?: unknown;
};

export type CompareResponse = {
  pass: boolean;
  hardFailures: CompareFailure[];
  softFailures: CompareFailure[];
  summary: { hard: number; soft: number };
};
