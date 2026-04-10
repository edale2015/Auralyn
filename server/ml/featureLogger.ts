import type { ClinicalFeatures } from "./featureStore";

export interface FeatureLogEntry {
  features:    ClinicalFeatures;
  outcome:     unknown;
  modelVersion: string;
  loggedAt:    string;
}

const MAX_LOG = 5000;
const log: FeatureLogEntry[] = [];

export function logFeatures(features: ClinicalFeatures, outcome: unknown, modelVersion = "unknown"): void {
  const entry: FeatureLogEntry = {
    features,
    outcome,
    modelVersion,
    loggedAt: new Date().toISOString(),
  };

  log.push(entry);
  if (log.length > MAX_LOG) log.shift();

  console.log("TRAIN_DATA", JSON.stringify({ features, outcome, modelVersion }));
}

export function getFeatureLog(limit = 100): FeatureLogEntry[] {
  return log.slice(-limit);
}

export function exportFeatureLogNdjson(): string {
  return log.map(e => JSON.stringify(e)).join("\n");
}

export function clearFeatureLog(): void {
  log.length = 0;
}

export function getFeatureLogStats(): { total: number; byModelVersion: Record<string, number> } {
  const byVersion: Record<string, number> = {};
  for (const e of log) {
    byVersion[e.modelVersion] = (byVersion[e.modelVersion] ?? 0) + 1;
  }
  return { total: log.length, byModelVersion: byVersion };
}
