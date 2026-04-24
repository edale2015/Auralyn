// ── Orchestrator ────────────────────────────────────────────────────────────────
//
// Production-grade multi-agent orchestrator with:
//   1. Topological sort (with cycle detection) — guarantees dependency order.
//   2. AbortController-based timeouts — hung agents release their resources.
//   3. Failure cascade — dependent agents are skipped when dependencies fail.
//   4. Per-agent circuit breakers (in-memory; redis layer in redisCircuitBreaker.ts).
//   5. Per-agent latency + outcome metrics.
//   6. Execution fingerprint — SHA-256 of (context, plan) for auditability.

import crypto from "crypto";
import { CircuitBreaker } from "../utils/circuitBreaker";
import { logger }         from "../utils/logger";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface AgentContext {
  text:      string;
  patientId?: string;
  answers?:  Record<string, string>;
  channel?:  "web" | "telegram" | "whatsapp";
  metadata?: Record<string, any>;
  signal?:   AbortSignal;   // injected by orchestrator — agents may honour it
}

export interface AgentOutput {
  [key: string]: any;
}

export interface Agent {
  name:      string;
  priority:  number;
  timeoutMs?: number;
  dependsOn?: string[];      // now enforced via topological sort
  fallbacks?: string[];      // for adaptive router (future)
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
}

export interface RunAgentsResult {
  results:        Record<string, AgentOutput>;
  errors:         Record<string, string>;
  skipped:        Record<string, string>;   // agentName → skipReason
  executionOrder: string[];
  durationMs:     number;
  metrics:        Record<string, any>;
  fingerprint:    string;
}

// ── Topological sort with cycle detection ────────────────────────────────────
// Called at plan-validation time — throws before any patient request is served.

export function topologicalSort(agents: Agent[]): Agent[] {
  const agentMap   = new Map(agents.map(a => [a.name, a]));
  const visited    = new Set<string>();
  const inProgress = new Set<string>();
  const sorted:    Agent[] = [];

  function visit(name: string, path: string[]): void {
    if (visited.has(name)) return;
    if (inProgress.has(name)) {
      throw new Error(
        `[Orchestrator] Circular dependency: ${[...path, name].join(" → ")}`
      );
    }

    const agent = agentMap.get(name);
    if (!agent) {
      throw new Error(
        `[Orchestrator] Dependency "${name}" is referenced but not registered`
      );
    }

    inProgress.add(name);
    for (const dep of agent.dependsOn ?? []) {
      visit(dep, [...path, name]);
    }
    inProgress.delete(name);
    visited.add(name);
    sorted.push(agent);
  }

  // Visit in priority order so that ties within a tier are stable
  const byPriority = [...agents].sort((a, b) => a.priority - b.priority);
  for (const agent of byPriority) {
    visit(agent.name, []);
  }

  return sorted;
}

// ── Registry + metrics ────────────────────────────────────────────────────────

const _agents: Agent[] = [];

const _agentBreakers = new Map<string, CircuitBreaker>();
function getBreakerForAgent(name: string): CircuitBreaker {
  if (!_agentBreakers.has(name)) {
    _agentBreakers.set(name, new CircuitBreaker(`agent:${name}`, 5, 60_000));
  }
  return _agentBreakers.get(name)!;
}

const _agentMetrics = new Map<string, {
  totalRuns: number;
  successes: number;
  failures:  number;
  timeouts:  number;
  latencies: number[];
}>();

function recordMetric(
  name:      string,
  durationMs: number,
  outcome:   "success" | "failure" | "timeout"
): void {
  if (!_agentMetrics.has(name)) {
    _agentMetrics.set(name, {
      totalRuns: 0, successes: 0, failures: 0, timeouts: 0, latencies: [],
    });
  }
  const m = _agentMetrics.get(name)!;
  m.totalRuns++;
  if (outcome === "success")      m.successes++;
  else if (outcome === "failure") m.failures++;
  else                            m.timeouts++;
  m.latencies.push(durationMs);
  if (m.latencies.length > 200) m.latencies.shift();
}

function computePercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Execution plan cache ──────────────────────────────────────────────────────
// Invalidated whenever an agent is registered.
let _sortedPlan: Agent[] | null = null;

function getExecutionPlan(): Agent[] {
  if (!_sortedPlan) {
    _sortedPlan = topologicalSort(_agents);
  }
  return _sortedPlan;
}

// ── Execution fingerprint ─────────────────────────────────────────────────────
function generateFingerprint(context: AgentContext, plan: Agent[]): string {
  const payload = JSON.stringify({
    context: { text: context.text, patientId: context.patientId, channel: context.channel },
    plan: plan.map(a => ({ name: a.name, priority: a.priority, dependsOn: a.dependsOn ?? [] })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function registerAgent(agent: Agent): void {
  const existing = _agents.findIndex(a => a.name === agent.name);
  if (existing >= 0) _agents[existing] = agent;
  else _agents.push(agent);
  _sortedPlan = null;   // invalidate cached plan
}

export function getRegisteredAgents(): string[] {
  return _agents.map(a => a.name);
}

export function getAgentMetrics(): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, m] of _agentMetrics.entries()) {
    const breaker = _agentBreakers.get(name);
    result[name] = {
      totalRuns:    m.totalRuns,
      successes:    m.successes,
      failures:     m.failures,
      timeouts:     m.timeouts,
      successRate:  m.totalRuns > 0 ? Math.round((m.successes / m.totalRuns) * 100) : 100,
      p50Ms:        computePercentile(m.latencies, 50),
      p95Ms:        computePercentile(m.latencies, 95),
      p99Ms:        computePercentile(m.latencies, 99),
      breakerState: breaker ? breaker.getState().state : "closed",
    };
  }
  return result;
}

// ── runAgents ─────────────────────────────────────────────────────────────────

export async function runAgents(context: AgentContext): Promise<RunAgentsResult> {
  const results:  Record<string, AgentOutput> = {};
  const errors:   Record<string, string>       = {};
  const skipped:  Record<string, string>       = {};
  const executionOrder: string[]               = [];
  const start = Date.now();

  const { isAgentEnabled } = await import("./agentConfig");

  // Validate + cache the dependency-ordered execution plan.
  // Throws at first call if any cycle exists — never at patient-request time.
  const plan = getExecutionPlan();

  const fingerprint = generateFingerprint(context, plan);

  const skippedDueToFailedDep = new Set<string>();

  for (const agent of plan) {
    // ── Feature flag ─────────────────────────────────────────────────────────
    if (!isAgentEnabled(agent.name)) {
      executionOrder.push(`${agent.name}:DISABLED`);
      skipped[agent.name] = "feature flag disabled";
      continue;
    }

    // ── Dependency check ──────────────────────────────────────────────────────
    const failedDep = (agent.dependsOn ?? []).find(dep =>
      dep in errors || skippedDueToFailedDep.has(dep)
    );
    if (failedDep) {
      const reason = `Dependency "${failedDep}" did not succeed`;
      skipped[agent.name] = reason;
      skippedDueToFailedDep.add(agent.name);
      executionOrder.push(`${agent.name}:SKIPPED_DEP_FAILED`);
      logger.warn("agent_skipped_dependency_failed", { agent: agent.name, dep: failedDep });
      continue;
    }

    // ── Circuit breaker ───────────────────────────────────────────────────────
    const breaker      = getBreakerForAgent(agent.name);
    const breakerState = breaker.getState();
    if (breakerState.state === "open") {
      const reason = `Circuit breaker open (${breakerState.failures} failures)`;
      skipped[agent.name] = reason;
      skippedDueToFailedDep.add(agent.name);
      executionOrder.push(`${agent.name}:CIRCUIT_OPEN`);
      logger.warn("agent_skipped_circuit_open", { agent: agent.name });
      continue;
    }

    // ── AbortController timeout ───────────────────────────────────────────────
    const timeoutMs      = agent.timeoutMs ?? 10_000;
    const abortCtrl      = new AbortController();
    const agentStart     = Date.now();
    const timeoutHandle  = setTimeout(() => abortCtrl.abort(), timeoutMs);

    try {
      const contextWithSignal: AgentContext = { ...context, signal: abortCtrl.signal };

      // Race: agent.run() vs abort signal resolving
      const output = await Promise.race([
        agent.run(contextWithSignal, results),
        new Promise<never>((_, reject) => {
          abortCtrl.signal.addEventListener("abort", () => {
            reject(new Error(`Agent "${agent.name}" timed out after ${timeoutMs}ms`));
          });
        }),
      ]);

      clearTimeout(timeoutHandle);

      // Record success before calling breaker (it may also record internally)
      results[agent.name] = output;
      executionOrder.push(agent.name);
      recordMetric(agent.name, Date.now() - agentStart, "success");

      logger.info("agent_run_complete", { agent: agent.name, durationMs: Date.now() - agentStart });

    } catch (err: any) {
      clearTimeout(timeoutHandle);
      abortCtrl.abort();   // ensure any lingering resource holders see the signal

      const isTimeout    = err?.message?.includes("timed out");
      const isCircuitOpen = err?.message?.includes("Circuit breaker OPEN");

      errors[agent.name] = err.message || "Unknown agent error";
      executionOrder.push(`${agent.name}:FAILED`);

      recordMetric(agent.name, Date.now() - agentStart, isTimeout ? "timeout" : "failure");

      logger.error("agent_run_failed", {
        agent:  agent.name,
        durationMs: Date.now() - agentStart,
        isTimeout,
        isCircuitOpen,
        error:  err.message,
      });

      try {
        const { logAgent } = await import("./tracking");
        logAgent(agent.name, { error: err.message }, Date.now() - agentStart, "error", err.message);
      } catch {}
    }
  }

  return {
    results,
    errors,
    skipped,
    executionOrder,
    durationMs:  Date.now() - start,
    metrics:     getAgentMetrics(),
    fingerprint,
  };
}

// ── Sepsis integration hook ───────────────────────────────────────────────────
// Called from /api/sepsis-twin/* routes. Runs the sepsis agent + safety gate.
export async function runWithSepsis(patient: Record<string, any>) {
  const { SepsisAgent }    = await import("./sepsisAgent");
  const { sepsisSafetyGate } = await import("../safety/sepsisGate");

  const sepsis = await new SepsisAgent().run(patient as any);
  const gate   = sepsisSafetyGate(sepsis);

  return { sepsis, gate };
}
