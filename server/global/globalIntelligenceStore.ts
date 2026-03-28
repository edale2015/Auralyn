import { ExportPayload } from "./exporter";
import { GlobalModel, aggregateModels, getModelHistory } from "../network/globalAggregator";
import { LocalModelWeights, applyGlobalWeights, trainLocal } from "../network/localNode";
import { logMetric } from "../monitoring/metrics";

export interface ClinicNode {
  clinicId: string;
  region: string;
  status: "online" | "degraded" | "offline";
  lastSeen: number;
  accuracy: number;
  sampleCount: number;
  modelVersion: number;
}

export interface GlobalIntelligenceState {
  connectedClinics: number;
  clinicNodes: ClinicNode[];
  currentModel: GlobalModel | null;
  modelVersion: string;
  globalAccuracy: number;
  lastSyncAt: string | null;
  cycleCount: number;
  distributionLog: Array<{ at: string; clinics: number; accuracy: number; version: number }>;
}

const simulatedClinics: ClinicNode[] = [
  { clinicId: "auralyn-miami-02",  region: "Miami, FL",   status: "online",   lastSeen: Date.now(), accuracy: 0.84, sampleCount: 312, modelVersion: 5 },
  { clinicId: "auralyn-boston-03", region: "Boston, MA",  status: "online",   lastSeen: Date.now(), accuracy: 0.87, sampleCount: 445, modelVersion: 5 },
  { clinicId: "auralyn-chicago-04",region: "Chicago, IL", status: "degraded", lastSeen: Date.now(), accuracy: 0.79, sampleCount: 198, modelVersion: 4 },
  { clinicId: "auralyn-la-05",     region: "Los Angeles", status: "online",   lastSeen: Date.now(), accuracy: 0.89, sampleCount: 612, modelVersion: 5 },
];

const localClinic: ClinicNode = {
  clinicId: process.env.CLINIC_ID ?? "auralyn-nyc-01",
  region: "New York, NY",
  status: "online",
  lastSeen: Date.now(),
  accuracy: 0,
  sampleCount: 0,
  modelVersion: 0,
};

let currentModel: GlobalModel | null = null;
let cycleCount = 0;
const distributionLog: GlobalIntelligenceState["distributionLog"] = [];

export function updateLocalClinicNode(payload: ExportPayload): void {
  localClinic.lastSeen     = payload.timestamp;
  localClinic.accuracy     = payload.metrics.accuracy;
  localClinic.sampleCount  = payload.metrics.similarityCases;
  localClinic.modelVersion = payload.modelVersion;
  localClinic.status       = "online";
}

function jitterSimClinics(): LocalModelWeights[] {
  return simulatedClinics
    .filter(c => c.status !== "offline")
    .map(c => {
      c.lastSeen = Date.now() - Math.floor(Math.random() * 120_000);
      c.accuracy = Math.min(0.99, c.accuracy + (Math.random() - 0.5) * 0.04);
      return {
        clinicId:    c.clinicId,
        weights:     { viral: c.accuracy, bacterial: 1 - c.accuracy, "strep-pharyngitis": c.accuracy * 0.9 },
        sampleCount: c.sampleCount,
        accuracy:    c.accuracy,
        reportedAt:  new Date(c.lastSeen).toISOString(),
        modelVersion: c.modelVersion,
      };
    });
}

export function runGlobalAggregationCycle(localPayload: ExportPayload): GlobalModel {
  const localModel: LocalModelWeights = {
    clinicId:     localPayload.clinicId,
    weights:      localPayload.weights,
    sampleCount:  localPayload.metrics.similarityCases || 100,
    accuracy:     localPayload.metrics.accuracy,
    reportedAt:   new Date(localPayload.timestamp).toISOString(),
    modelVersion: localPayload.modelVersion,
  };

  const simModels = jitterSimClinics();
  const allModels = [localModel, ...simModels];

  const globalModel = aggregateModels(allModels);
  currentModel = globalModel;
  cycleCount++;

  applyGlobalWeights(globalModel.weights);

  trainLocal({
    features: Object.entries(globalModel.weights).map(([k, v]) => ({ [k]: v })),
    labels:   Object.keys(globalModel.weights),
  }, localPayload.clinicId);

  logMetric("global.intelligence.cycle", cycleCount, "throughput");
  logMetric("global.intelligence.accuracy", globalModel.averageAccuracy, "accuracy");

  distributionLog.push({
    at:       new Date().toISOString(),
    clinics:  globalModel.participatingClinics.length,
    accuracy: globalModel.averageAccuracy,
    version:  globalModel.version,
  });
  if (distributionLog.length > 20) distributionLog.shift();

  console.log(`[GlobalIntelligence] Cycle #${cycleCount} — ${allModels.length} clinics, accuracy ${(globalModel.averageAccuracy * 100).toFixed(1)}%`);
  return globalModel;
}

export function getGlobalIntelligenceState(): GlobalIntelligenceState {
  const allNodes = [localClinic, ...simulatedClinics];
  return {
    connectedClinics: allNodes.filter(n => n.status !== "offline").length,
    clinicNodes:      allNodes,
    currentModel,
    modelVersion: currentModel ? `v${currentModel.version}` : "none",
    globalAccuracy: currentModel?.averageAccuracy ?? 0,
    lastSyncAt:    distributionLog.at(-1)?.at ?? null,
    cycleCount,
    distributionLog: distributionLog.slice(-5),
  };
}

export function applyGlobalBoost(localScore: number, dx: string): number {
  if (!currentModel) return localScore;
  const globalW = currentModel.weights[dx];
  if (!globalW) return localScore;
  return localScore * globalW;
}

export function getModelHistoryPublic() {
  return getModelHistory(5).map(m => ({
    version:       m.version,
    clinics:       m.participatingClinics.length,
    accuracy:      m.averageAccuracy,
    totalSamples:  m.totalSamples,
    aggregatedAt:  m.aggregatedAt,
  }));
}
