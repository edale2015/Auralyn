/**
 * Recommendation 3: Central Phase Registry
 *
 * Single source of truth for all architecture phases.
 * Each entry declares what the phase owns, its activation status,
 * and a runtime health check so any dashboard can query one endpoint
 * instead of hard-coding knowledge of which directories exist.
 */

import { getDriftState }      from "../../learning/driftControl";
import { getDebateAgentStats } from "../../phase9/debate/debateEngine";
import { getControlTowerData } from "../../phase6/controlTower/controlTowerFeed";

export interface PhaseRecord {
  phase:       string;
  name:        string;
  status:      "active" | "inactive" | "degraded";
  description: string;
  owns:        string[];
  routes:      string[];
  healthFn?:   () => Promise<Record<string, unknown>>;
}

const PHASE_REGISTRY: PhaseRecord[] = [
  {
    phase: "phase6",
    name:  "Control Tower",
    status: "active",
    description: "Real-time operational visibility — system metrics, agent health, event bus, incident feed.",
    owns:   ["controlTowerFeed", "eventBus", "metricsStore", "systemMonitor"],
    routes: ["/api/phase6/control-tower", "/api/monitoring/*"],
    healthFn: async () => ({ ...getControlTowerData(), source: "phase6" }),
  },
  {
    phase: "phase7",
    name:  "Continuous Learning",
    status: "active",
    description: "RLHF-based outcome logging, policy evolution, physician feedback loops.",
    owns:   ["outcomeLogger", "rlhfWeightTuner", "learningCycle", "physicianFeedback"],
    routes: ["/api/outcomes/*", "/api/learning/*"],
    healthFn: async () => {
      const drift = getDriftState();
      return { driftLocked: drift.locked, driftScore: drift.score, source: "phase7" };
    },
  },
  {
    phase: "phase8",
    name:  "Autonomous Coordinator",
    status: "active",
    description: "Agent orchestration, policy enforcement, self-healing, autonomy decisions.",
    owns:   ["agentCoordinator", "autonomyEngine", "policyEngine", "recoveryLoop"],
    routes: ["/api/run", "/api/autonomy/*"],
    healthFn: async () => ({ pipeline: "autonomous_v1.2.0", source: "phase8" }),
  },
  {
    phase: "phase9",
    name:  "Multi-Agent Intelligence",
    status: "active",
    description: "Debate engine, discovery agents, policy evolution, executive command.",
    owns:   ["debateEngine", "discoveryAgents", "policyEvolution", "continuousLearning"],
    routes: ["/api/phase9/*", "/api/executive"],
    healthFn: async () => {
      try {
        const stats = getDebateAgentStats();
        return { debateStats: stats, source: "phase9" };
      } catch {
        return { debateStats: null, source: "phase9", error: "stats_unavailable" };
      }
    },
  },
];

export function getPhaseRegistry(): PhaseRecord[] {
  return PHASE_REGISTRY;
}

export function getPhaseByName(phase: string): PhaseRecord | undefined {
  return PHASE_REGISTRY.find(p => p.phase === phase);
}

export async function getPhaseHealthSummary(): Promise<Record<string, unknown>[]> {
  return Promise.all(
    PHASE_REGISTRY.map(async (p) => {
      let health: Record<string, unknown> = {};
      if (p.healthFn) {
        try {
          health = await p.healthFn();
        } catch (e: any) {
          health = { error: e?.message ?? "health_check_failed" };
        }
      }
      return {
        phase:  p.phase,
        name:   p.name,
        status: p.status,
        owns:   p.owns,
        routes: p.routes,
        health,
      };
    })
  );
}
