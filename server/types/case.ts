export type CaseStatus =
  | "INTAKE_IN_PROGRESS"
  | "AWAITING_REVIEW"
  | "IN_REVIEW"
  | "SIGNED_OFF"
  | "NEEDS_MORE_INFO"
  | "ESCALATED"
  | "CLOSED";

export type SourceChannel =
  | "telegram"
  | "web_chat"
  | "sms"
  | "whatsapp"
  | "internal_dashboard"
  | "unknown";

export type ReviewStatus =
  | "NOT_REVIEWED"
  | "PENDING_REVIEW"
  | "REVIEWING"
  | "APPROVED"
  | "OVERRIDDEN"
  | "REJECTED";

export type EngineDisposition =
  | "ER_SEND"
  | "URGENT"
  | "PCP"
  | "SELF_CARE"
  | "UNKNOWN";

export interface DxCandidate {
  dxId: string;
  label: string;
  bestClusterId?: string;
  baseScore?: number;
  rank?: number;
}

export interface ClusterScoreSnapshot {
  clusterId: string;
  score: number;
  reasons?: string[];
}

export interface RuleTraceItem {
  table: "RED_FLAG_RULES" | "CLUSTER_SCORING_RULES" | "DISPOSITION_RULES" | "OTHER";
  ruleId: string;
  fired: boolean;
  expr?: string;
  evidenceLabel?: string;
  points?: number;
  metadata?: Record<string, unknown>;
}

export interface CasePatientContext {
  patientId?: string;
  encounterId?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  ageYears?: number;
  sex?: string;
  mrn?: string;
}

export interface CaseEngineResult {
  complaintId: string;
  complaintLabel?: string;
  recommendedDisposition: EngineDisposition;
  confidence?: "HIGH" | "MODERATE" | "LOW" | string;
  triggeredRedFlags: string[];
  winningClusterId?: string;
  dxCandidates: DxCandidate[];
  clusterScores?: ClusterScoreSnapshot[];
  ruleTrace?: RuleTraceItem[];
  noteDraft?: string;
  returnPrecautions?: string[];
  render?: Record<string, unknown>;
  engineVersion?: string;
}

export interface CaseRecord {
  caseId: string;
  createdAt: string;
  updatedAt: string;

  status: CaseStatus;
  reviewStatus: ReviewStatus;

  sourceChannel: SourceChannel;
  assignedReviewerId?: string;

  patientContext?: CasePatientContext;

  complaintId: string;
  complaintLabel?: string;

  conversationId?: string;
  externalThreadId?: string;
  sessionId?: string;

  answers: Record<string, unknown>;
  lastQuestionToken?: string;
  unansweredCriticalQuestions?: string[];

  engineResult?: CaseEngineResult;

  physicianSummary?: string;
  noteDraft?: string;

  signoffId?: string;
  signoffRequired: boolean;
  exportedToEcw?: boolean;

  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type CaseEventType =
  | "CASE_CREATED"
  | "MESSAGE_RECEIVED"
  | "QUESTION_ASKED"
  | "ANSWER_RECORDED"
  | "ENGINE_RUN"
  | "RED_FLAG_TRIGGERED"
  | "DISPOSITION_UPDATED"
  | "DX_CANDIDATES_UPDATED"
  | "ASSIGNED_REVIEWER"
  | "REVIEW_STARTED"
  | "REVIEW_REQUESTED_MORE_INFO"
  | "SIGNOFF_COMPLETED"
  | "SIGNOFF_OVERRIDDEN"
  | "EXPORTED_ECW"
  | "CASE_CLOSED"
  | "CUSTOM";

export interface CaseEventRecord {
  eventId: string;
  caseId: string;
  type: CaseEventType;
  createdAt: string;
  actorId?: string;
  actorRole?: string;
  summary: string;
  payload?: Record<string, unknown>;
}
