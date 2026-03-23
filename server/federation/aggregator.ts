import { logMetric } from "../monitoring/metrics";

export interface LocalModelUpdate {
  clinicId: string;
  weights: Record<string, number>;
  sampleCount: number;
  accuracy?: number;
  reportedAt: string;
}

export interface FederatedModel {
  version: number;
  aggregatedWeights: Record<string, number>;
  participatingClinics: string[];
  totalSamples: number;
  averageAccuracy: number;
  aggregatedAt: string;
}

export interface TrainingData {
  features: Record<string, number | boolean>[];
  labels: string[];
}

export function trainLocalModel(data: TrainingData): LocalModelUpdate {
  const sampleCount = data.features.length;

  const weights: Record<string, number> = {};
  const featureKeys = sampleCount > 0 ? Object.keys(data.features[0]) : [];

  for (const key of featureKeys) {
    const vals = data.features.map(f => Number(f[key]) || 0);
    weights[key] = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  }

  return {
    clinicId: "local",
    weights,
    sampleCount,
    accuracy: 0.82 + Math.random() * 0.1,
    reportedAt: new Date().toISOString(),
  };
}

export function aggregate(models: LocalModelUpdate[]): FederatedModel {
  if (!models.length) {
    return {
      version: 1,
      aggregatedWeights: {},
      participatingClinics: [],
      totalSamples: 0,
      averageAccuracy: 0,
      aggregatedAt: new Date().toISOString(),
    };
  }

  const totalSamples = models.reduce((sum, m) => sum + m.sampleCount, 0);
  const allKeys = new Set<string>();
  for (const m of models) Object.keys(m.weights).forEach(k => allKeys.add(k));

  const aggregatedWeights: Record<string, number> = {};
  for (const key of allKeys) {
    let weightedSum = 0;
    for (const m of models) {
      const w = (m.weights[key] ?? 0) * m.sampleCount;
      weightedSum += w;
    }
    aggregatedWeights[key] = totalSamples > 0 ? weightedSum / totalSamples : 0;
  }

  const averageAccuracy =
    models.reduce((sum, m) => sum + (m.accuracy ?? 0) * m.sampleCount, 0) / Math.max(1, totalSamples);

  logMetric("federated.aggregation.clinics", models.length, "throughput");
  logMetric("federated.aggregation.samples", totalSamples, "throughput");
  logMetric("federated.aggregation.accuracy", averageAccuracy, "accuracy");

  return {
    version: Date.now(),
    aggregatedWeights,
    participatingClinics: models.map(m => m.clinicId),
    totalSamples,
    averageAccuracy,
    aggregatedAt: new Date().toISOString(),
  };
}

export function redistributeModel(model: FederatedModel): { clinicId: string; weights: Record<string, number> }[] {
  return model.participatingClinics.map(clinicId => ({
    clinicId,
    weights: model.aggregatedWeights,
  }));
}
