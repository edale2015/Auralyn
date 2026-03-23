import { TimelinePoint, buildTimeline, TimelineState } from "./timelineEngine";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export type DeteriorationPrediction =
  | "HIGH_RISK_DETERIORATION"
  | "MODERATE_RISK"
  | "STABLE"
  | "IMPROVING";

export interface PredictionResult {
  prediction: DeteriorationPrediction;
  timeframe?: string;
  confidence: number;
  triggerFactors: string[];
  recommendedAction: string;
}

const DETERIORATION_THRESHOLD = 0.3;
const MODERATE_THRESHOLD = 0.15;

export function predictDeterioration(timeline: TimelinePoint[]): PredictionResult {
  if (timeline.length < 2) {
    return {
      prediction: "STABLE",
      confidence: 0.5,
      triggerFactors: ["insufficient_data"],
      recommendedAction: "continue_monitoring",
    };
  }

  const trend = timeline.slice(-3);
  const earliest = trend[0];
  const latest = trend[trend.length - 1];

  const riskIncrease = latest.riskScore - earliest.riskScore;
  const triggerFactors: string[] = [];

  if ((latest.vitals?.oxygenSaturation ?? 99) < 92) triggerFactors.push("low_spo2");
  if ((latest.vitals?.respRate ?? 16) >= 28) triggerFactors.push("tachypnea");
  if ((latest.vitals?.systolicBp ?? 120) < 90) triggerFactors.push("hypotension");
  if ((latest.vitals?.heartRate ?? 75) > 110) triggerFactors.push("tachycardia");
  if ((latest.vitals?.temperature ?? 37) >= 39.5) triggerFactors.push("high_fever");

  const worstTrend = trend.filter(p => p.trend === "worsening").length;

  if (riskIncrease > DETERIORATION_THRESHOLD || triggerFactors.length >= 3) {
    logMetric("prediction.high_risk", 1, "safety", { riskIncrease: String(riskIncrease) });
    return {
      prediction: "HIGH_RISK_DETERIORATION",
      timeframe: "6-12h",
      confidence: Math.min(0.95, 0.7 + riskIncrease * 0.5),
      triggerFactors,
      recommendedAction: "immediate_physician_escalation",
    };
  }

  if (riskIncrease > MODERATE_THRESHOLD || worstTrend >= 2) {
    return {
      prediction: "MODERATE_RISK",
      timeframe: "12-24h",
      confidence: 0.65 + riskIncrease,
      triggerFactors,
      recommendedAction: "increase_monitoring_frequency",
    };
  }

  if (riskIncrease < -0.1) {
    return {
      prediction: "IMPROVING",
      confidence: 0.75,
      triggerFactors,
      recommendedAction: "continue_current_plan",
    };
  }

  return {
    prediction: "STABLE",
    confidence: 0.8,
    triggerFactors,
    recommendedAction: "routine_follow_up",
  };
}

export async function analyzeAndEscalate(
  history: TimelineState[],
  patientId: string,
  onEscalate: (result: PredictionResult) => void
): Promise<PredictionResult> {
  const timeline = buildTimeline(history);
  const result = predictDeterioration(timeline);

  auditLog({
    actor: "timeline_predictor",
    action: `prediction:${result.prediction}`,
    patientId,
    riskScore: timeline[timeline.length - 1]?.riskScore,
    details: { prediction: result.prediction, timeframe: result.timeframe },
  });

  if (result.prediction === "HIGH_RISK_DETERIORATION") {
    onEscalate(result);
  }

  return result;
}
