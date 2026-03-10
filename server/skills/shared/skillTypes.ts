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
};

export type SkillResult<T = any> = {
  skillId: string;
  skillName: string;
  version: string;
  status: "success" | "partial" | "error";
  confidence: number;
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
