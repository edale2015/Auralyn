import { saveSnapshot } from "./systemSnapshot";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getMetrics } from "../monitoring/metricsStore";
import { getAutoThreshold } from "../autonomy/autonomyEngine";
import { getQueueStats } from "../queue/patientQueue";
import { isUsingFallback } from "../redis/redisClient";

export interface FullSystemState {
  autonomyThreshold: number;
  circuitBreakers: Record<string, string>;
  errorRate: number;
  p95Latency: number;
  queueDepth: number;
  redisFallback: boolean;
  capturedAt: string;
  weights?: Record<string, number>;
  sloState?: {
    errorRateOk: boolean;
    latencyOk: boolean;
    queueOk: boolean;
  };
  modelVersion?: string;
  autonomyConfig?: {
    threshold: number;
    mode: string;
  };
}

export async function captureSystemState(
  weights?: Record<string, number>,
  modelVersion?: string
): Promise<FullSystemState> {
  const [breakers, metrics, queueStats] = await Promise.all([
    Promise.resolve(getAllBreakerStates()),
    Promise.resolve(getMetrics()),
    Promise.resolve(getQueueStats()),
  ]);

  const threshold = getAutoThreshold();
  const queueDepth = queueStats?.queueDepth ?? queueStats?.pending ?? 0;
  const redisFallback = isUsingFallback();
  const errorRate = metrics.errorRate ?? 0;
  const p95Latency = metrics.p95Latency ?? 0;

  const sloState = {
    errorRateOk: errorRate < 0.05,
    latencyOk: p95Latency < 3000,
    queueOk: queueDepth < 500,
  };

  const mode = threshold >= 0.97 ? "critical_load" : threshold >= 0.95 ? "high_load" : "nominal";

  return {
    autonomyThreshold: threshold,
    circuitBreakers: breakers as Record<string, string>,
    errorRate: Number(errorRate.toFixed(4)),
    p95Latency,
    queueDepth,
    redisFallback,
    capturedAt: new Date().toISOString(),
    weights,
    sloState,
    modelVersion: modelVersion ?? "1.0.0",
    autonomyConfig: {
      threshold,
      mode,
    },
  };
}

export async function saveFullSnapshot(params: {
  traceId: string;
  patientId?: string;
  complaint?: string;
  input: Record<string, any>;
  weights?: Record<string, number>;
  modelVersion?: string;
  safetyLevel?: string;
  confidence?: number;
  autonomyMode?: string;
}): Promise<FullSystemState | null> {
  try {
    const systemState = await captureSystemState(params.weights, params.modelVersion);

    await saveSnapshot(
      {
        traceId: params.traceId,
        weights: params.weights,
        safety: { level: params.safetyLevel ?? "UNKNOWN" },
        confidence: params.confidence,
        autonomyMode: params.autonomyMode ?? systemState.autonomyConfig?.mode,
        queueDepth: systemState.queueDepth,
        circuitBreakers: Object.entries(systemState.circuitBreakers).map(([name, status]) => ({ name, status })),
        scores: {
          sloState: systemState.sloState,
          errorRate: systemState.errorRate,
          p95Latency: systemState.p95Latency,
          redisFallback: systemState.redisFallback,
          capturedAt: systemState.capturedAt,
        },
      },
      {
        traceId: params.traceId,
        patientId: params.patientId,
        complaint: params.complaint,
      }
    );

    return systemState;
  } catch (e: any) {
    console.error("[FullSnapshot] Failed to save:", e?.message);
    return null;
  }
}
