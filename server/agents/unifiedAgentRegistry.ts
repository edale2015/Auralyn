import { pool } from '../db';
import { logger } from '../utils/logger';

export type AgentStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'disabled';
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface AgentHeartbeatInput {
  agentId: string;
  type: 'coordinator' | 'task' | 'governance' | 'ms';
  version: string;
  p95LatencyMs?: number;
  successRate?: number;
  status?: AgentStatus;
  circuitBreakerState?: CircuitBreakerState;
}

export interface AgentRecord {
  agentId: string;
  type: string;
  status: AgentStatus;
  lastHeartbeat: Date;
  circuitBreakerState: CircuitBreakerState;
  p95LatencyMs: number;
  successRate: number;
  version: string;
}

export class UnifiedAgentRegistry {
  async upsertHeartbeat(input: AgentHeartbeatInput): Promise<void> {
    await pool.query(
      `INSERT INTO agent_registry
         (agent_id, type, status, last_heartbeat, circuit_breaker_state, p95_latency_ms, success_rate, version)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
       ON CONFLICT (agent_id) DO UPDATE SET
         last_heartbeat = NOW(),
         type = EXCLUDED.type,
         status = EXCLUDED.status,
         circuit_breaker_state = EXCLUDED.circuit_breaker_state,
         p95_latency_ms = EXCLUDED.p95_latency_ms,
         success_rate = EXCLUDED.success_rate,
         version = EXCLUDED.version`,
      [
        input.agentId,
        input.type,
        input.status ?? 'healthy',
        input.circuitBreakerState ?? 'closed',
        input.p95LatencyMs ?? 0,
        input.successRate ?? 1,
        input.version,
      ],
    );
  }

  async markMissedHeartbeatsAsDegraded(maxAgeMs = 90_000): Promise<number> {
    const threshold = new Date(Date.now() - maxAgeMs);
    const result = await pool.query(
      `UPDATE agent_registry
       SET status = 'degraded'
       WHERE last_heartbeat < $1
         AND status NOT IN ('disabled', 'critical')`,
      [threshold],
    );
    const affected = result.rowCount ?? 0;
    if (affected > 0) {
      logger.warn('[UnifiedAgentRegistry] Agents marked degraded due to missed heartbeats', { count: affected });
    }
    return affected;
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const result = await pool.query(
      `SELECT agent_id, type, status, last_heartbeat, circuit_breaker_state, p95_latency_ms, success_rate, version
       FROM agent_registry WHERE agent_id = $1`,
      [agentId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      agentId: row.agent_id,
      type: row.type,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      circuitBreakerState: row.circuit_breaker_state,
      p95LatencyMs: row.p95_latency_ms,
      successRate: row.success_rate,
      version: row.version,
    };
  }

  async listAgents(): Promise<AgentRecord[]> {
    const result = await pool.query(
      `SELECT agent_id, type, status, last_heartbeat, circuit_breaker_state, p95_latency_ms, success_rate, version
       FROM agent_registry ORDER BY agent_id`,
    );
    return result.rows.map(row => ({
      agentId: row.agent_id,
      type: row.type,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      circuitBreakerState: row.circuit_breaker_state,
      p95LatencyMs: row.p95_latency_ms,
      successRate: row.success_rate,
      version: row.version,
    }));
  }
}

export const unifiedAgentRegistry = new UnifiedAgentRegistry();
