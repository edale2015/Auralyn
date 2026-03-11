export type TranscriptTurn = {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
};

export type SkillConfig = {
  version?: string;
  strictMode?: boolean;
  maxQuestions?: number;
  enableAudit?: boolean;
  orchestrationMode?: "sequential" | "graph";
  cheapRuleFirst?: boolean;
  maxLlmCostUsdPerCase?: number;
};

export type SkillContext = {
  caseId: string;
  patientId?: string;
  encounterId?: string;
  complaintId?: string;
  complaintName?: string;
  rawText?: string;
  transcript?: TranscriptTurn[];
  modifiers?: Record<string, any>;
  knownFacts?: Record<string, any>;
  priorSkillOutputs?: Record<string, any>;
  metadata?: {
    channel?: "web" | "telegram" | "sms" | "voice" | "ehr" | "unknown";
    clinicId?: string;
    siteId?: string;
    clinicianId?: string;
    createdAt?: string;
  };
  config?: SkillConfig;
};

export type SkillAudit = {
  tablesUsed: string[];
  ruleHits: string[];
  missingData: string[];
  warnings?: string[];
  latencyMs: number;
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  complaintFamily?: string;
};

export type SkillResult<T = any> = {
  skillId: string;
  skillName: string;
  version: string;
  status: "success" | "partial" | "error";
  confidence: number;
  reasoning_summary?: string;
  result: T;
  audit: SkillAudit;
  nextRecommendedSkills?: string[];
};

export type PlatformPrinciplesCheck = {
  decisionDataCaptured: boolean;
  infrastructureReusable: boolean;
  outcomeAttachPoint: boolean;
  workflowEmbedded: boolean;
  networkEffectReady: boolean;
  physicianTimeSaved: boolean;
  regulatorySafe: boolean;
  highValueComplaint: boolean;
  productModuleAssigned: boolean;
  expertPathwayPreserved: boolean;
  strategicNotes?: string[];
};

export type OutcomeStub = {
  outcomeTrackingId: string;
  caseId: string;
  complaintId?: string;
  expectedFollowUpWindowDays: number;
  callbackNeeded: boolean;
  outcomeStatus: "pending" | "complete" | "unreachable";
  linkedDiagnosis?: string;
  linkedTreatment?: string;
  linkedDisposition?: string;
  createdAt: string;
};

export type ReviewPacket = {
  caseId: string;
  complaintSummary: string;
  keyModifiers: Record<string, any>;
  keyFindings: Record<string, any>;
  redFlags: string[];
  likelyDiagnoses: string[];
  proposedDisposition: string;
  cautionNotes: string[];
  approvalChecklist: string[];
};

export type OrchestratorState = {
  context: SkillContext;
  skillResults: Record<string, SkillResult>;
  completedSkills: string[];
  pendingSkills: string[];
  halted: boolean;
  finalDisposition?: string;
  platformChecks?: PlatformPrinciplesCheck;
};

export type ReasoningGraphNode = {
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
  requiredInputs?: string[];
  produces?: string[];
  safetyClass?: "medium" | "high" | "critical";
  estimatedCostUsd?: number;
  estimatedLatencyMs?: number;
  engineType?: "rules" | "hybrid" | "llm" | "retrieval";
  stopIfComplete?: boolean;
};

export type ReasoningGraphEdge = {
  from: string;
  to: string;
  guardName: string;
  priority?: number;
};

export type ReasoningGraphState = {
  caseId: string;
  complaintId?: string;
  knownFacts: Record<string, any>;
  modifiers: Record<string, any>;
  completedSkills: string[];
  availableSkills: string[];
  pendingSkills: string[];
  redFlagSeverity?: string;
  disposition?: string;
  confidenceBySkill: Record<string, number>;
  totalEstimatedCostUsd: number;
  totalEstimatedLatencyMs: number;
};
