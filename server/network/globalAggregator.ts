import { LocalModelWeights } from "./localNode";
import { logMetric } from "../monitoring/metrics";

export interface GlobalModel {
  version: number;
  weights: Record<string, number>;
  participatingClinics: string[];
  totalSamples: number;
  averageAccuracy: number;
  aggregatedAt: string;
}

const modelHistory: GlobalModel[] = [];

export function aggregateModels(models: LocalModelWeights[]): GlobalModel {
  if (!models.length) {
    return {
      version: 1,
      weights: {},
      participatingClinics: [],
      totalSamples: 0,
      averageAccuracy: 0,
      aggregatedAt: new Date().toISOString(),
    };
  }

  const totalSamples = models.reduce((sum, m) => sum + m.sampleCount, 0);
  const allKeys = new Set<string>();
  for (const m of models) Object.keys(m.weights).forEach(k => allKeys.add(k));

  const weights: Record<string, number> = {};
  for (const key of allKeys) {
    let weightedSum = 0;
    for (const m of models) {
      weightedSum += (m.weights[key] ?? 0) * m.sampleCount;
    }
    weights[key] = totalSamples > 0 ? weightedSum / totalSamples : 0;
  }

  const averageAccuracy =
    models.reduce((sum, m) => sum + m.accuracy * m.sampleCount, 0) / Math.max(1, totalSamples);

  const globalModel: GlobalModel = {
    version: Date.now(),
    weights,
    participatingClinics: models.map(m => m.clinicId),
    totalSamples,
    averageAccuracy,
    aggregatedAt: new Date().toISOString(),
  };

  modelHistory.push(globalModel);

  logMetric("federated.global.clinics", models.length, "throughput");
  logMetric("federated.global.accuracy", averageAccuracy, "accuracy");

  return globalModel;
}

export function distribute(model: GlobalModel): Array<{ clinicId: string; weights: Record<string, number> }> {
  return model.participatingClinics.map(clinicId => ({ clinicId, weights: model.weights }));
}

export function getModelHistory(limit = 5): GlobalModel[] {
  return modelHistory.slice(-limit);
}
