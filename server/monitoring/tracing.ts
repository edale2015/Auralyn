export interface TraceStep {
  name: string;
  timestamp: number;
  durationMs?: number;
  data?: any;
  error?: string;
}

export interface Trace {
  traceId: string;
  operation: string;
  steps: TraceStep[];
  totalDurationMs: number;
  success: boolean;
  completedAt: string;
}

const traceStore: Trace[] = [];
const MAX_TRACES = 500;
let totalTraces = 0;

export function traceStep(name: string, data?: any): TraceStep {
  return { name, timestamp: Date.now(), data };
}

export function buildTrace(operation: string, steps: TraceStep[], success = true): Trace {
  const start = steps[0]?.timestamp ?? Date.now();
  const end   = steps[steps.length - 1]?.timestamp ?? Date.now();

  const stepsWithDuration = steps.map((s, i) => ({
    ...s,
    durationMs: i < steps.length - 1 ? steps[i + 1].timestamp - s.timestamp : 0,
  }));

  const trace: Trace = {
    traceId: `TRACE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    operation,
    steps: stepsWithDuration,
    totalDurationMs: end - start,
    success,
    completedAt: new Date().toISOString(),
  };

  traceStore.push(trace);
  totalTraces++;
  if (traceStore.length > MAX_TRACES) traceStore.shift();

  return trace;
}

export function getRecentTraces(limit = 20): Trace[] {
  return traceStore.slice(-limit).reverse();
}

export function getTracingStats() {
  const avgDuration = traceStore.length > 0
    ? +(traceStore.reduce((s, t) => s + t.totalDurationMs, 0) / traceStore.length).toFixed(1)
    : 0;
  const failed = traceStore.filter((t) => !t.success).length;
  return {
    active: true,
    totalTraces,
    buffered: traceStore.length,
    avgDurationMs: avgDuration,
    failedTraces: failed,
  };
}
