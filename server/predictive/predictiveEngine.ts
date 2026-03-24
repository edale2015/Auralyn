import { getMetrics } from "../monitoring/metricsStore";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";

const WINDOW = 50;

const history = {
  latency: [] as number[],
  errorRate: [] as number[],
  timestamps: [] as number[],
};

export function recordMetricsSnapshot(): void {
  const m = getMetrics();
  history.latency.push(m.avgLatency);
  history.errorRate.push(m.errorRate);
  history.timestamps.push(Date.now());

  if (history.latency.length > WINDOW) {
    history.latency.shift();
    history.errorRate.shift();
    history.timestamps.shift();
  }
}

export type PredictionResult = {
  predicted: boolean;
  reason: string | null;
  latencyTrend: number;
  errorTrend: number;
  confidence: "low" | "medium" | "high";
  history: { latency: number[]; errorRate: number[] };
};

export function predictFailure(): PredictionResult {
  const n = history.latency.length;
  if (n < 5) {
    return { predicted: false, reason: null, latencyTrend: 0, errorTrend: 0, confidence: "low", history: { latency: [], errorRate: [] } };
  }

  const half = Math.floor(n / 2);
  const recentLatencyAvg = history.latency.slice(half).reduce((s, v) => s + v, 0) / (n - half);
  const oldLatencyAvg    = history.latency.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const latencyTrend     = recentLatencyAvg - oldLatencyAvg;

  const recentErrorAvg = history.errorRate.slice(half).reduce((s, v) => s + v, 0) / (n - half);
  const oldErrorAvg    = history.errorRate.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const errorTrend     = recentErrorAvg - oldErrorAvg;

  const confidence: PredictionResult["confidence"] = n >= WINDOW ? "high" : n >= 20 ? "medium" : "low";

  if (latencyTrend > 500 || errorTrend > 0.02) {
    return {
      predicted: true,
      reason: latencyTrend > 500
        ? `Latency trending up +${latencyTrend.toFixed(0)}ms`
        : `Error rate trending up +${(errorTrend * 100).toFixed(2)}%`,
      latencyTrend,
      errorTrend,
      confidence,
      history: {
        latency: history.latency.slice(-20),
        errorRate: history.errorRate.slice(-20),
      },
    };
  }

  return {
    predicted: false,
    reason: null,
    latencyTrend,
    errorTrend,
    confidence,
    history: {
      latency: history.latency.slice(-20),
      errorRate: history.errorRate.slice(-20),
    },
  };
}

let _loop: ReturnType<typeof setInterval> | null = null;

export function startPredictiveLoop(intervalMs = 5_000): void {
  if (_loop) return;
  _loop = setInterval(async () => {
    recordMetricsSnapshot();
    const pred = predictFailure();

    if (pred.predicted && pred.confidence !== "low") {
      console.warn("[Predictive] Failure predicted:", pred.reason);
      await sendPhysicianAlert({
        caseId: "system",
        priority: "HIGH",
        reason: `Predicted failure: ${pred.reason} (confidence=${pred.confidence})`,
      }).catch(() => {});
    }
  }, intervalMs);
  console.log(`[Predictive] Engine started (interval=${intervalMs}ms)`);
}

export function stopPredictiveLoop(): void {
  if (_loop) { clearInterval(_loop); _loop = null; }
}
