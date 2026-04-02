import { CircuitBreaker } from "../utils/circuitBreaker";
import { withTimeoutStrict } from "../utils/withTimeout";
import { logger } from "../utils/logger";

export interface AgentContext {
  text: string;
  patientId?: string;
  answers?: Record<string, string>;
  channel?: "web" | "telegram" | "whatsapp";
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  [key: string]: any;
}

export interface Agent {
  name: string;
  priority: number;
  timeoutMs?: number;
  dependsOn?: string[];
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
}

const agents: Agent[] = [];

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
  failures: number;
  timeouts: number;
  latencies: number[];
}>();

function recordMetric(name: string, durationMs: number, outcome: "success" | "failure" | "timeout") {
  if (!_agentMetrics.has(name)) {
    _agentMetrics.set(name, { totalRuns: 0, successes: 0, failures: 0, timeouts: 0, latencies: [] });
  }
  const m = _agentMetrics.get(name)!;
  m.totalRuns++;
  if (outcome === "success") m.successes++;
  else if (outcome === "failure") m.failures++;
  else m.timeouts++;
  m.latencies.push(durationMs);
  if (m.latencies.length > 200) m.latencies.shift();
}

function computePercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getAgentMetrics() {
  const result: Record<string, any> = {};
  for (const [name, m] of _agentMetrics.entries()) {
    const breaker = _agentBreakers.get(name);
    result[name] = {
      totalRuns: m.totalRuns,
      successes: m.successes,
      failures: m.failures,
      timeouts: m.timeouts,
      successRate: m.totalRuns > 0 ? Math.round((m.successes / m.totalRuns) * 100) : 100,
      p50Ms: computePercentile(m.latencies, 50),
      p95Ms: computePercentile(m.latencies, 95),
      p99Ms: computePercentile(m.latencies, 99),
      breakerState: breaker ? breaker.getState().state : "closed",
    };
  }
  return result;
}

export function registerAgent(agent: Agent) {
  const existing = agents.findIndex((a) => a.name === agent.name);
  if (existing >= 0) agents[existing] = agent;
  else agents.push(agent);
  agents.sort((a, b) => a.priority - b.priority);
}

export function getRegisteredAgents(): string[] {
  return agents.map((a) => a.name);
}

export async function runAgents(context: AgentContext): Promise<{
  results: Record<string, AgentOutput>;
  errors: Record<string, string>;
  executionOrder: string[];
  durationMs: number;
  metrics: Record<string, any>;
}> {
  const results: Record<string, AgentOutput> = {};
  const errors: Record<string, string> = {};
  const executionOrder: string[] = [];
  const start = Date.now();

  const { isAgentEnabled } = await import("./agentConfig");

  for (const agent of agents) {
    if (!isAgentEnabled(agent.name)) {
      executionOrder.push(`${agent.name}:SKIPPED`);
      continue;
    }

    if (agent.dependsOn && agent.dependsOn.length > 0) {
      const failedDep = agent.dependsOn.find(dep => dep in errors);
      if (failedDep) {
        executionOrder.push(`${agent.name}:SKIPPED_DEP_FAILED`);
        logger.warn("agent_skipped_dependency_failed", { agent: agent.name, dep: failedDep });
        continue;
      }
    }

    const agentStart = Date.now();
    const timeoutMs = agent.timeoutMs ?? 10_000;
    const breaker = getBreakerForAgent(agent.name);

    try {
      const output = await breaker.call(() =>
        withTimeoutStrict(() => agent.run(context, results), timeoutMs)
      );
      results[agent.name] = output;
      executionOrder.push(agent.name);
      const elapsed = Date.now() - agentStart;
      recordMetric(agent.name, elapsed, "success");

      logger.info("agent_run_complete", { agent: agent.name, durationMs: elapsed });
    } catch (err: any) {
      const elapsed = Date.now() - agentStart;
      const isTimeout = err?.message?.includes("timed out");
      const isCircuitOpen = err?.message?.includes("Circuit breaker OPEN");

      errors[agent.name] = err.message || "Unknown agent error";
      executionOrder.push(`${agent.name}:FAILED`);

      recordMetric(agent.name, elapsed, isTimeout ? "timeout" : "failure");

      logger.error("agent_run_failed", {
        agent: agent.name,
        durationMs: elapsed,
        isTimeout,
        isCircuitOpen,
        error: err.message,
      });

      try {
        const { logAgent } = await import("./tracking");
        logAgent(agent.name, { error: err.message }, elapsed, "error", err.message);
      } catch {}
    }
  }

  return {
    results,
    errors,
    executionOrder,
    durationMs: Date.now() - start,
    metrics: getAgentMetrics(),
  };
}
