/**
 * EVENT LOOP LAG MONITOR
 *
 * Measures Node.js event loop lag using a high-resolution timer.
 * High lag (>100ms) means the event loop is blocked — clinical requests
 * are delayed and timeouts may fire incorrectly.
 *
 * Exposes:
 *   - Current lag (ms)
 *   - Rolling p50, p95, p99
 *   - Alerts when lag exceeds clinical safety threshold
 */

const LAG_WARNING_MS = 100;
const LAG_CRITICAL_MS = 500;
const SAMPLE_INTERVAL_MS = 1000;
const HISTORY_SIZE = 300;

const lagHistory: number[] = [];
let currentLagMs = 0;
let monitorTimer: ReturnType<typeof setInterval> | null = null;

function measureLag(): void {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const lagNs = Number(process.hrtime.bigint() - start);
    const lagMs = lagNs / 1e6;
    currentLagMs = lagMs;

    lagHistory.push(lagMs);
    if (lagHistory.length > HISTORY_SIZE) lagHistory.shift();

    if (lagMs >= LAG_CRITICAL_MS) {
      console.error(
        `🚨 [EventLoop] CRITICAL lag: ${lagMs.toFixed(1)}ms — Node.js event loop is severely blocked. Clinical request timeouts may fire incorrectly.`,
      );
    } else if (lagMs >= LAG_WARNING_MS) {
      console.warn(
        `⚠️  [EventLoop] WARNING lag: ${lagMs.toFixed(1)}ms — event loop is degraded.`,
      );
    }
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getEventLoopStats(): {
  currentLagMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  sampleCount: number;
  status: "ok" | "warning" | "critical";
} {
  const sorted = [...lagHistory].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);

  return {
    currentLagMs: Math.round(currentLagMs * 10) / 10,
    p50Ms: Math.round(percentile(sorted, 50) * 10) / 10,
    p95Ms: Math.round(p95 * 10) / 10,
    p99Ms: Math.round(percentile(sorted, 99) * 10) / 10,
    sampleCount: lagHistory.length,
    status: p95 >= LAG_CRITICAL_MS ? "critical" : p95 >= LAG_WARNING_MS ? "warning" : "ok",
  };
}

export function startEventLoopMonitor(): void {
  if (monitorTimer) return;
  monitorTimer = setInterval(measureLag, SAMPLE_INTERVAL_MS);
  console.log("[EventLoopMonitor] Started (1s sampling)");
}

export function stopEventLoopMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
