export type CaseStatus =
  | "DRAFT"
  | "TRIAGED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "SENT"
  | "CLOSED";

export type ReviewStatus =
  | "NONE"
  | "APPROVED"
  | "MODIFIED"
  | "ESCALATED"
  | "REJECTED";

export type Disposition = "er_send" | "urgent_care" | "pcp" | "self_care";

export type Confidence = "HIGH" | "MODERATE" | "LOW";

export type ConsistencyAction = "FLAG_ONLY" | "NEEDS_REVIEW" | "FORCE_EMERG";
export type ConsistencySeverity = "LOW" | "MODERATE" | "HIGH";

export type ConsistencyFlag = {
  ruleId: string;
  action: ConsistencyAction;
  severity: ConsistencySeverity;
  message: string;
};

export type CaseMessage = {
  ts: string;
  dir: "in" | "out";
  channel: "web" | "telegram" | "whatsapp";
  text: string;
  meta?: Record<string, unknown>;
};

export type ScoringItem = {
  ruleId: string;
  clusterId: string;
  points: number;
};

export type CaseTriageScoringExplanation = {
  topRules: ScoringItem[];
  topSuppressors: ScoringItem[];
  rfTriggered: string[];
  tieBreak: "score" | "priority" | "dx_id" | "none";
  margin: number;
  confidence: Confidence;
};

export type CaseTriage = {
  disposition: Disposition;
  topCluster: string;
  confidence: Confidence;
  tieBreak: CaseTriageScoringExplanation["tieBreak"];
  margin: number;
  rfTriggered: string[];
  explanation: CaseTriageScoringExplanation;
  consistencyFlags?: ConsistencyFlag[];
  engineVersion: {
    rulesetVersion: string;
    dxPriorityVersion: string;
  };
};

export type PhysicianReview = {
  status: ReviewStatus;
  reviewedAt: string | null;
  reviewer: { id: string; name: string } | null;
  notes: string;
  finalDisposition: Disposition | null;
  finalDx: string | null;
};

export type CaseDoc = {
  caseId: string;
  createdAt: string;
  updatedAt: string;
  state: CaseStatus;

  source: {
    channel: "web" | "telegram" | "whatsapp";
    threadId?: string;
    userId?: string;
  };

  complaint: {
    slug: string;
    display: string;
    engine: "GENERIC_V1" | "LEGACY";
  };

  answers: {
    structured: Record<string, unknown>;
    answerHash: string;
  };

  triage: CaseTriage | null;

  physicianReview: PhysicianReview;

  messages: CaseMessage[];
};
