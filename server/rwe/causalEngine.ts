import { emitEvent } from "../controlTower/eventBus";

export interface PatientOutcome {
  patientId: string;
  recovered: boolean;
  resolutionDays?: number;
  escalated?: boolean;
  readmitted?: boolean;
  safetyEvent?: boolean;
  metadata?: Record<string, any>;
}

export interface CausalInput {
  aiGroup: PatientOutcome[];
  controlGroup: PatientOutcome[];
  studyLabel?: string;
  minSampleSize?: number;
}

export interface CausalMetrics {
  aiRecoveryRate: number;
  controlRecoveryRate: number;
  uplift: number;
  relativeLift: number;
  numberNeededToTreat: number | null;
  aiMedianDays: number | null;
  controlMedianDays: number | null;
  daysDelta: number | null;
  escalationReduction: number;
}

export interface CausalReport {
  studyLabel: string;
  evaluatedAt: string;
  sampleSizes: { ai: number; control: number };
  metrics: CausalMetrics;
  interpretation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  warningFlags: string[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function recoveryRate(group: PatientOutcome[]): number {
  if (!group.length) return 0;
  return group.filter((p) => p.recovered).length / group.length;
}

function escalationRate(group: PatientOutcome[]): number {
  if (!group.length) return 0;
  return group.filter((p) => p.escalated).length / group.length;
}

export function estimateImpact(input: CausalInput): CausalMetrics {
  const { aiGroup, controlGroup } = input;

  const aiRecoveryRate = recoveryRate(aiGroup);
  const controlRecoveryRate = recoveryRate(controlGroup);
  const uplift = aiRecoveryRate - controlRecoveryRate;
  const relativeLift = controlRecoveryRate > 0 ? uplift / controlRecoveryRate : 0;

  const nnt = uplift > 0 ? Math.ceil(1 / uplift) : null;

  const aiDays = aiGroup.map((p) => p.resolutionDays).filter((d): d is number => d !== undefined);
  const ctrlDays = controlGroup.map((p) => p.resolutionDays).filter((d): d is number => d !== undefined);
  const aiMedianDays = median(aiDays);
  const controlMedianDays = median(ctrlDays);
  const daysDelta =
    aiMedianDays !== null && controlMedianDays !== null ? controlMedianDays - aiMedianDays : null;

  const escalationReduction = escalationRate(controlGroup) - escalationRate(aiGroup);

  return {
    aiRecoveryRate: Number(aiRecoveryRate.toFixed(4)),
    controlRecoveryRate: Number(controlRecoveryRate.toFixed(4)),
    uplift: Number(uplift.toFixed(4)),
    relativeLift: Number(relativeLift.toFixed(4)),
    numberNeededToTreat: nnt,
    aiMedianDays,
    controlMedianDays,
    daysDelta,
    escalationReduction: Number(escalationReduction.toFixed(4)),
  };
}

function interpretUplift(metrics: CausalMetrics): string {
  const { uplift, numberNeededToTreat, daysDelta } = metrics;

  if (uplift <= 0) {
    return "AI group showed no improvement over control. Consider model retraining or cohort re-stratification.";
  }

  const parts: string[] = [];
  parts.push(
    `AI group recovered ${(uplift * 100).toFixed(1)}% more often than control (NNT = ${numberNeededToTreat ?? "N/A"}).`
  );
  if (daysDelta !== null && daysDelta > 0) {
    parts.push(`Resolution was ${daysDelta.toFixed(1)} days faster in the AI group.`);
  }
  if (metrics.escalationReduction > 0) {
    parts.push(`Escalation rate reduced by ${(metrics.escalationReduction * 100).toFixed(1)}%.`);
  }
  return parts.join(" ");
}

function assessConfidence(aiN: number, ctrlN: number, minSample: number): "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT" {
  if (aiN < minSample || ctrlN < minSample) return "INSUFFICIENT";
  if (aiN >= 100 && ctrlN >= 100) return "HIGH";
  if (aiN >= 30 && ctrlN >= 30) return "MEDIUM";
  return "LOW";
}

const recentReports: CausalReport[] = [];

export function buildCausalReport(input: CausalInput): CausalReport {
  const { aiGroup, controlGroup, studyLabel = "Unnamed Study", minSampleSize = 30 } = input;

  const warningFlags: string[] = [];
  if (aiGroup.length < minSampleSize) warningFlags.push(`AI group too small (${aiGroup.length} < ${minSampleSize})`);
  if (controlGroup.length < minSampleSize) warningFlags.push(`Control group too small (${controlGroup.length} < ${minSampleSize})`);

  const ratio = aiGroup.length > 0 ? controlGroup.length / aiGroup.length : 0;
  if (ratio < 0.5 || ratio > 2) warningFlags.push(`Group size imbalance (AI:${aiGroup.length} vs Control:${controlGroup.length})`);

  const metrics = estimateImpact(input);
  const confidence = assessConfidence(aiGroup.length, controlGroup.length, minSampleSize);

  const report: CausalReport = {
    studyLabel,
    evaluatedAt: new Date().toISOString(),
    sampleSizes: { ai: aiGroup.length, control: controlGroup.length },
    metrics,
    interpretation: interpretUplift(metrics),
    confidence,
    warningFlags,
  };

  recentReports.push(report);
  if (recentReports.length > 50) recentReports.shift();

  emitEvent({
    type: "REGION_STATUS",
    payload: {
      source: "causalEngine",
      studyLabel,
      uplift: metrics.uplift,
      confidence,
      evaluatedAt: report.evaluatedAt,
    },
    timestamp: Date.now(),
  });

  return report;
}

export function getRecentCausalReports(limit = 10): CausalReport[] {
  return recentReports.slice(-limit);
}
