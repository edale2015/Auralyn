export interface ReplayArtifact {
  type: "screenshot" | "dom" | "network" | "log";
  path?: string;
  inlineText?: string;
  createdAt: string;
}

export interface ReplayStepRecord {
  stepId: string;
  stepName: string;
  action: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  selectorOriginal?: string;
  selectorResolved?: string;
  selectorHealingApplied?: boolean;
  inputPreview?: string;
  outputPreview?: string;
  errorMessage?: string;
  artifacts: ReplayArtifact[];
  variablesUsed?: string[];
  approvalState?: "not-required" | "approved" | "denied" | "pending";
}

export interface ReplaySession {
  replayId: string;
  templateId: string;
  versionId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  initiatedBy: string;
  environment: string;
  stepRecords: ReplayStepRecord[];
}
