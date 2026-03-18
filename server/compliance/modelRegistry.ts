export const MODEL_VERSION = "v1.0.0";

export interface ModelUsageEntry {
  caseId: string;
  modelVersion: string;
  engineVersions: Record<string, string>;
  timestamp: string;
}

const usageLog: ModelUsageEntry[] = [];

export function logModelUsage(caseId: string, engineVersions?: Record<string, string>): ModelUsageEntry {
  const entry: ModelUsageEntry = {
    caseId,
    modelVersion: MODEL_VERSION,
    engineVersions: engineVersions || {
      scoringEngine: "1.0.0",
      diagnosisEngine: "1.0.0",
      triageEngine: "1.0.0",
      safetyEngine: "1.0.0",
    },
    timestamp: new Date().toISOString(),
  };
  usageLog.push(entry);
  return entry;
}

export function getModelUsageLog(limit = 100): ModelUsageEntry[] {
  return usageLog.slice(-limit);
}

export function getModelVersion(): string {
  return MODEL_VERSION;
}
