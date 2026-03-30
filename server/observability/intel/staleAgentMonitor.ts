/**
 * Recommendation 6: Stale Agent Monitor
 *
 * An agent that registers itself but stops sending heartbeats is a silent
 * failure — it appears in the registry as "healthy" while doing nothing.
 *
 * This module classifies every governance-registered agent into one of:
 *   - fresh   (heartbeat within the last 5 minutes)
 *   - stale   (heartbeat 5–30 minutes ago)
 *   - ghost   (heartbeat > 30 minutes ago, or never)
 *
 * Ghost agents are flagged for manual review — they may represent an
 * orphaned process, a crashed worker, or a test agent that was never
 * cleaned up.
 */

import { getAgents } from "../../governance/agentRegistry";
import { emitEvent }    from "../../controlTower/eventBus";
import { logger }       from "../../utils/logger";

const STALE_THRESHOLD_MS  = 5  * 60 * 1000;
const GHOST_THRESHOLD_MS  = 30 * 60 * 1000;

export type AgentVitality = "fresh" | "stale" | "ghost";

export interface AgentVitalityRecord {
  id:             string;
  role:           string;
  health:         string;
  lastSeenAt:     string;
  silentForMs:    number;
  vitality:       AgentVitality;
}

export function classifyAgentVitality(): AgentVitalityRecord[] {
  const now    = Date.now();
  const agents = getAgents();

  return agents.map(agent => {
    const lastSeen    = agent.lastSeenAt ? new Date(agent.lastSeenAt).getTime() : 0;
    const silentForMs = now - lastSeen;

    let vitality: AgentVitality = "fresh";
    if (silentForMs > GHOST_THRESHOLD_MS)  vitality = "ghost";
    else if (silentForMs > STALE_THRESHOLD_MS) vitality = "stale";

    return {
      id:          agent.id,
      role:        agent.role,
      health:      agent.health,
      lastSeenAt:  agent.lastSeenAt,
      silentForMs,
      vitality,
    };
  });
}

export function getStaleAgentSummary() {
  const records = classifyAgentVitality();
  const fresh   = records.filter(r => r.vitality === "fresh");
  const stale   = records.filter(r => r.vitality === "stale");
  const ghost   = records.filter(r => r.vitality === "ghost");

  if (ghost.length > 0) {
    ghost.forEach(g => {
      logger.warn("ghost_agent_detected", {
        agentId:     g.id,
        silentForMs: g.silentForMs,
      });
    });

    emitEvent({
      type:      "ALERT",
      payload:   {
        message:  `${ghost.length} ghost agent(s) detected: ${ghost.map(g => g.id).join(", ")}`,
        severity: "MEDIUM",
        agents:   ghost.map(g => g.id),
      },
      timestamp: Date.now(),
    });
  }

  return {
    checkedAt:  new Date().toISOString(),
    total:      records.length,
    fresh:      fresh.length,
    stale:      stale.length,
    ghost:      ghost.length,
    ghostIds:   ghost.map(g => g.id),
    staleIds:   stale.map(g => g.id),
    all:        records,
  };
}
