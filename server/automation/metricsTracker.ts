/**
 * Automation Metrics Tracker — Prometheus-ready in-memory counters
 *
 * Tracks:
 *   automation_runs_total          — total template execution attempts
 *   automation_failures_total      — failed template executions
 *   automation_selector_heal_count — selectors healed across all runs
 *   automation_template_latency_ms — p50/p95/max latency distribution
 *
 * Designed for Prometheus-style scraping or the /api/automation/metrics endpoint.
 * Thread-safe for single-process Node.js (event loop serialization).
 */

interface LatencyBucket {
  count: number;
  sum:   number;
  max:   number;
  p95:   number;   // recalculated on each read — approximate sliding window
}

interface AutomationMetrics {
  runsTotal:         number;
  failuresTotal:     number;
  selectorHealCount: number;
  latencyMs:         LatencyBucket;
  lastUpdatedAt:     string | null;
  // Per-template breakdown
  byTemplate:        Record<string, TemplateMetrics>;
}

interface TemplateMetrics {
  runs:     number;
  failures: number;
  heals:    number;
  latencies: number[];   // keep last 100
}

// ── In-memory state ───────────────────────────────────────────────────────────

const LATENCY_WINDOW = 100;   // keep last N latencies for p95

const state: AutomationMetrics = {
  runsTotal:         0,
  failuresTotal:     0,
  selectorHealCount: 0,
  latencyMs:         { count: 0, sum: 0, max: 0, p95: 0 },
  lastUpdatedAt:     null,
  byTemplate:        {},
};

const _latencies: number[] = [];   // raw window for p95

function updateLatency(ms: number): void {
  _latencies.push(ms);
  if (_latencies.length > LATENCY_WINDOW) _latencies.shift();

  state.latencyMs.count++;
  state.latencyMs.sum += ms;
  state.latencyMs.max  = Math.max(state.latencyMs.max, ms);

  const sorted = [..._latencies].sort((a, b) => a - b);
  const p95idx = Math.floor(sorted.length * 0.95);
  state.latencyMs.p95 = sorted[p95idx] ?? sorted[sorted.length - 1] ?? 0;
}

function ensureTemplate(templateKey: string): TemplateMetrics {
  if (!state.byTemplate[templateKey]) {
    state.byTemplate[templateKey] = { runs: 0, failures: 0, heals: 0, latencies: [] };
  }
  return state.byTemplate[templateKey];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function recordRun(opts: {
  templateKey:  string;
  success:      boolean;
  durationMs:   number;
  healedCount?: number;
}): void {
  state.runsTotal++;
  state.lastUpdatedAt = new Date().toISOString();
  updateLatency(opts.durationMs);

  if (!opts.success) state.failuresTotal++;
  if (opts.healedCount) state.selectorHealCount += opts.healedCount;

  const tmpl = ensureTemplate(opts.templateKey);
  tmpl.runs++;
  if (!opts.success) tmpl.failures++;
  if (opts.healedCount) tmpl.heals += opts.healedCount;
  tmpl.latencies.push(opts.durationMs);
  if (tmpl.latencies.length > LATENCY_WINDOW) tmpl.latencies.shift();
}

export function getMetrics(): AutomationMetrics {
  return {
    ...state,
    byTemplate: { ...state.byTemplate },
  };
}

export function getFailureRate(): number {
  return state.runsTotal > 0 ? state.failuresTotal / state.runsTotal : 0;
}

export function resetMetrics(): void {
  state.runsTotal         = 0;
  state.failuresTotal     = 0;
  state.selectorHealCount = 0;
  state.latencyMs         = { count: 0, sum: 0, max: 0, p95: 0 };
  state.lastUpdatedAt     = null;
  state.byTemplate        = {};
  _latencies.length       = 0;
}

/** Prometheus text-format export (subset) */
export function toPrometheusText(): string {
  const lines = [
    `# HELP automation_runs_total Total automation template executions`,
    `# TYPE automation_runs_total counter`,
    `automation_runs_total ${state.runsTotal}`,
    `# HELP automation_failures_total Failed automation executions`,
    `# TYPE automation_failures_total counter`,
    `automation_failures_total ${state.failuresTotal}`,
    `# HELP automation_selector_heal_count Selectors healed across all runs`,
    `# TYPE automation_selector_heal_count counter`,
    `automation_selector_heal_count ${state.selectorHealCount}`,
    `# HELP automation_template_latency_ms_p95 P95 template execution latency`,
    `# TYPE automation_template_latency_ms_p95 gauge`,
    `automation_template_latency_ms_p95 ${state.latencyMs.p95}`,
    `# HELP automation_template_latency_ms_max Max template execution latency`,
    `# TYPE automation_template_latency_ms_max gauge`,
    `automation_template_latency_ms_max ${state.latencyMs.max}`,
  ];
  return lines.join("\n") + "\n";
}
