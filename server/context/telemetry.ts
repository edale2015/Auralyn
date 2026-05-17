/**
 * Context Engineering Telemetry — T020
 *
 * Emits structured log lines for every key context event.
 * Also maintains an in-process ring buffer for the /api/context-health/24h endpoint.
 *
 * Metrics emitted:
 *   auralyn.context.prompt_tokens              (tag: role)
 *   auralyn.context.artifacts_published        (tag: type)
 *   auralyn.context.artifacts_excluded_for_budget
 *   auralyn.context.compaction_event           (tag: pre_step)
 *   auralyn.context.bus_contract_violation     (tag: role, artifact_type)
 *   auralyn.context.memory_hits                (tag: scope)
 *   auralyn.context.prefix_stability           (tag: role)  1=stable, 0=changed
 *
 * File: server/context/telemetry.ts
 */

export interface ContextMetric {
  metric:       string;
  value:        number;
  tags:         Record<string, string>;
  encounterId?: string;
  timestamp:    string;
}

// Ring buffer — holds last 50 000 metric points in-process
const MAX_BUFFER = 50_000;
let _buffer: ContextMetric[] = [];

export function emitMetric(
  metric:      string,
  value:       number,
  tags:        Record<string, string> = {},
  encounterId?: string,
): void {
  const entry: ContextMetric = {
    metric, value, tags, encounterId,
    timestamp: new Date().toISOString(),
  };
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) {
    _buffer = _buffer.slice(-Math.floor(MAX_BUFFER / 2));
  }
  // Structured log line — grepable with: grep "auralyn.context" /var/log/auralyn/app.log
  console.log(JSON.stringify({ auralyn_context_metric: true, ...entry }));
}

// ── Named helpers (avoids string literals at call sites) ─────────────────────

export function emitPromptTokens(role: string, tokens: number, encounterId: string): void {
  emitMetric("auralyn.context.prompt_tokens", tokens, { role }, encounterId);
}

export function emitArtifactPublished(type: string, encounterId: string): void {
  emitMetric("auralyn.context.artifacts_published", 1, { type }, encounterId);
}

export function emitArtifactsExcluded(count: number, encounterId: string): void {
  if (count > 0) {
    emitMetric("auralyn.context.artifacts_excluded_for_budget", count, {}, encounterId);
  }
}

export function emitCompactionEvent(preStep: number, encounterId: string): void {
  emitMetric("auralyn.context.compaction_event", 1, { pre_step: String(preStep) }, encounterId);
}

export function emitContractViolation(role: string, artifactType: string): void {
  emitMetric("auralyn.context.bus_contract_violation", 1, { role, artifact_type: artifactType });
  console.error(
    `[telemetry] CONTRACT VIOLATION: role=${role} artifact_type=${artifactType}`,
  );
}

export function emitMemoryHit(scope: string, count: number, encounterId: string): void {
  if (count > 0) {
    emitMetric("auralyn.context.memory_hits", count, { scope }, encounterId);
  }
}

export function emitPrefixStability(role: string, stable: boolean, encounterId: string): void {
  emitMetric("auralyn.context.prefix_stability", stable ? 1 : 0, { role }, encounterId);
}

// ── Buffer queries (for /api/context-health/24h) ──────────────────────────────

export function getRecentMetrics(windowMs: number = 24 * 60 * 60 * 1000): ContextMetric[] {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  return _buffer.filter(m => m.timestamp >= cutoff);
}

export function getContractViolationCount(windowMs: number = 24 * 60 * 60 * 1000): number {
  return getRecentMetrics(windowMs).filter(
    m => m.metric === "auralyn.context.bus_contract_violation",
  ).length;
}

/**
 * Returns percentile from a sorted numeric array.
 * p50 = 0.5, p95 = 0.95, p99 = 0.99
 */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx    = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

export function summarize24h(): Record<string, unknown> {
  const recent   = getRecentMetrics();
  const byMetric = new Map<string, number[]>();

  for (const m of recent) {
    const bucket = `${m.metric}|${JSON.stringify(m.tags)}`;
    const arr    = byMetric.get(bucket) ?? [];
    arr.push(m.value);
    byMetric.set(bucket, arr);
  }

  // Prompt tokens by role
  const promptTokensByRole: Record<string, { p50: number; p95: number }> = {};
  for (const role of ["triage", "differential", "disposition", "billing", "supervisor"]) {
    const vals = recent
      .filter(m => m.metric === "auralyn.context.prompt_tokens" && m.tags.role === role)
      .map(m => m.value);
    promptTokensByRole[role] = { p50: percentile(vals, 0.5), p95: percentile(vals, 0.95) };
  }

  // Artifacts per encounter
  const artPerEnc = new Map<string, number>();
  for (const m of recent.filter(m => m.metric === "auralyn.context.artifacts_published" && m.encounterId)) {
    artPerEnc.set(m.encounterId!, (artPerEnc.get(m.encounterId!) ?? 0) + 1);
  }
  const artCounts = [...artPerEnc.values()];

  // Distinct types per encounter
  const typesByEnc = new Map<string, Set<string>>();
  for (const m of recent.filter(m => m.metric === "auralyn.context.artifacts_published" && m.encounterId)) {
    const s = typesByEnc.get(m.encounterId!) ?? new Set<string>();
    if (m.tags.type) s.add(m.tags.type);
    typesByEnc.set(m.encounterId!, s);
  }
  const distinctCounts = [...typesByEnc.values()].map(s => s.size);

  // Compaction events per encounter
  const compByEnc = new Map<string, number>();
  for (const m of recent.filter(m => m.metric === "auralyn.context.compaction_event" && m.encounterId)) {
    compByEnc.set(m.encounterId!, (compByEnc.get(m.encounterId!) ?? 0) + 1);
  }
  const compCounts = [...compByEnc.values()];
  const compMean   = compCounts.length ? compCounts.reduce((a, b) => a + b, 0) / compCounts.length : 0;

  // Contract violations
  const contractViolations = getContractViolationCount();

  // Memory hits by scope
  const memHitsByScope: Record<string, number> = {};
  for (const m of recent.filter(m => m.metric === "auralyn.context.memory_hits")) {
    const scope = m.tags.scope ?? "unknown";
    memHitsByScope[scope] = (memHitsByScope[scope] ?? 0) + m.value;
  }

  // Prefix stability
  const stabilityVals = recent
    .filter(m => m.metric === "auralyn.context.prefix_stability")
    .map(m => m.value);
  const prefixStabilityRate = stabilityVals.length
    ? stabilityVals.reduce((a, b) => a + b, 0) / stabilityVals.length
    : null;

  // Top excluded types
  const excludedByType = new Map<string, number>();
  for (const m of recent.filter(m => m.metric === "auralyn.context.artifacts_excluded_for_budget")) {
    const type = m.tags.type ?? "unknown";
    excludedByType.set(type, (excludedByType.get(type) ?? 0) + m.value);
  }
  const topExcludedTypes = [...excludedByType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  return {
    prompt_tokens_by_role:         promptTokensByRole,
    artifacts_per_encounter:       { p50: percentile(artCounts, 0.5), p95: percentile(artCounts, 0.95) },
    distinct_types_per_encounter:  { p50: percentile(distinctCounts, 0.5) },
    compaction_events:             { mean: Math.round(compMean * 100) / 100 },
    contract_violations:           contractViolations,
    memory_store_size:             memHitsByScope,
    prefix_stability:              prefixStabilityRate,
    top_excluded_types:            topExcludedTypes,
    window_hours:                  24,
    sample_count:                  recent.length,
  };
}
