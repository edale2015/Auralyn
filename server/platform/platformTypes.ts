export type ReleaseMode = "sequential" | "graph" | "compare";

export type TenantSiteConfig = {
  siteId: string;
  siteName: string;
  enabledComplaints: string[];
  enabledModules: string[];
  rolloutModes: Record<string, ReleaseMode>;
  maxLlmCostUsdPerCase: number;
  requireReasoningSummary: boolean;
  requireGoldenPassRate: number;
};

export type ReleaseGateResult = {
  complaint: string;
  siteId: string;
  passed: boolean;
  score: number;
  checks: Array<{
    check: string;
    passed: boolean;
    value: string | number | boolean;
  }>;
};

export type DeploymentReadinessResult = {
  ready: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
};

export type ReviewQueueItem = {
  id: string;
  type:
    | "clinical_review"
    | "reconciliation_review"
    | "hardening_review"
    | "callback_review"
    | "graph_compare_review";
  caseId?: string;
  complaint?: string;
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  payload: Record<string, any>;
};
