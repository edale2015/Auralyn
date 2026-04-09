/**
 * Automation Monitor — Oversight Integration (Packet 20)
 *
 * Watches automation job results in real time and:
 *   1. Calculates rolling failure rate across the last N jobs
 *   2. Triggers validation worker if failure rate exceeds threshold
 *   3. Emits structured alerts for the oversight agent
 *   4. Feeds selector_drift insights into meta-learning
 *
 * Wired up via:
 *   - onJobResult() listener (queue.ts) — receives every job outcome
 *   - autonomousOversightAgent.ts — calls analyzeAutomationMetrics()
 *
 * Thread-safe for single-process Node.js (event loop serialization).
 */

import { onJobResult, type JobResult } from "../automation/queue";
import { getMetrics }                  from "../automation/metricsTracker";
import { getBrokenSelectors }          from "../automation/selectorScore";

export const FAILURE_RATE_THRESHOLD = 0.1;   // 10% — trigger alert
const WINDOW_SIZE = 50;                       // rolling window size

// ── Rolling window ────────────────────────────────────────────────────────────

const _window: boolean[] = [];   // true = success, false = failure

function pushResult(ok: boolean): void {
  _window.push(ok);
  if (_window.length > WINDOW_SIZE) _window.shift();
}

function rollingFailureRate(): number {
  if (_window.length === 0) return 0;
  const failures = _window.filter((v) => !v).length;
  return failures / _window.length;
}

// ── Automation metrics snapshot ───────────────────────────────────────────────

export interface AutomationHealthSnapshot {
  runsTotal:         number;
  failuresTotal:     number;
  failureRate:       number;
  rollingFailureRate: number;
  selectorHealCount: number;
  alert:             string | null;
  actions:           string[];
  brokenSelectors:   number;
}

export async function getAutomationHealthSnapshot(): Promise<AutomationHealthSnapshot> {
  const metrics       = getMetrics();
  const brokenRows    = await getBrokenSelectors().catch(() => []);
  const failureRate   = metrics.runsTotal > 0 ? metrics.failuresTotal / metrics.runsTotal : 0;
  const rollingRate   = rollingFailureRate();

  let alert:   string | null = null;
  const actions: string[]    = [];

  if (rollingRate > FAILURE_RATE_THRESHOLD) {
    alert = `Automation instability detected — rolling failure rate: ${(rollingRate * 100).toFixed(1)}%`;
    actions.push("Trigger validation worker");
    actions.push("Review broken selectors");
  }

  if (brokenRows.length > 0) {
    const extra = `${brokenRows.length} selector(s) below confidence threshold`;
    alert = alert ? `${alert}; ${extra}` : extra;
    actions.push("Run AI repair scan");
  }

  return {
    runsTotal:          metrics.runsTotal,
    failuresTotal:      metrics.failuresTotal,
    failureRate,
    rollingFailureRate: rollingRate,
    selectorHealCount:  metrics.selectorHealCount,
    alert,
    actions,
    brokenSelectors:    brokenRows.length,
  };
}

/**
 * Analyse a batch of automation run records.
 * Accepts the same shape the autonomousOversightAgent passes in its loop.
 */
export function analyzeAutomationMetrics(runs: Array<{ ok: boolean }>): {
  failureRate: number;
  alert:       string | null;
  actions:     string[];
} {
  if (runs.length === 0) return { failureRate: 0, alert: null, actions: [] };

  const failures    = runs.filter((r) => !r.ok).length;
  const failureRate = failures / runs.length;
  const alert       = failureRate > FAILURE_RATE_THRESHOLD
    ? `Automation instability detected — failure rate: ${(failureRate * 100).toFixed(1)}%`
    : null;
  const actions: string[] = alert
    ? ["Trigger validation worker", "Review template selectors"]
    : [];

  return { failureRate, alert, actions };
}

// ── Real-time listener (started once at boot) ─────────────────────────────────

let _listenerAttached = false;

export function startAutomationMonitor(): void {
  if (_listenerAttached) return;
  _listenerAttached = true;

  onJobResult((result: JobResult) => {
    pushResult(result.ok);

    const rate = rollingFailureRate();
    if (rate > FAILURE_RATE_THRESHOLD && _window.length >= 5) {
      console.warn(
        `[automationMonitor] Rolling failure rate: ${(rate * 100).toFixed(1)}% — ` +
        `consider running validation worker`
      );
    }
  });

  console.log("[automationMonitor] Real-time automation monitor started");
}
