/**
 * Recommendation 5 & 11: Unified System Map + Per-Engine Status
 *
 * Returns a single machine-readable payload describing the complete
 * operational topology: agents, engines, skills, phases, circuit breakers,
 * and the last known health state of each.
 *
 * This is the document a new engineer (or Claude) needs to understand
 * the full system at a glance — and the payload the frontend Control Tower
 * should poll to render a live architecture diagram.
 */

import { SKILL_REGISTRY }        from "../../skills/registry/skillRegistry";
import { SKILL_VERSION_REGISTRY } from "../../skills/registry/skillVersionRegistry";
import { getEngineDependencyList } from "../../analysis/engineDependencyGraph";
import { getAllBreakerStates }     from "../../utils/circuitBreaker";
import { getMetrics }             from "../../monitoring/metricsStore";
import { getAgents }           from "../../governance/agentRegistry";
import { getAgentRegistry }       from "../../agents/agentConfig";
import { getPhaseRegistry }       from "./phaseRegistry";
import { ENGINE_REGISTRY }        from "../../system/engineScheduler";

export interface SystemMapPayload {
  generatedAt:    string;
  version:        string;
  agents: {
    configured:   Record<string, { enabled: boolean; disabledAt?: string; disabledBy?: string; reason?: string }>;
    governance:   ReturnType<typeof getAgents>;
  };
  engines: {
    scheduled:    string[];
    dependencyGraph: ReturnType<typeof getEngineDependencyList>;
  };
  skills: {
    registry:     typeof SKILL_REGISTRY;
    versions:     typeof SKILL_VERSION_REGISTRY;
  };
  phases:         ReturnType<typeof getPhaseRegistry>;
  circuitBreakers: ReturnType<typeof getAllBreakerStates>;
  metrics:        ReturnType<typeof getMetrics>;
}

export function buildSystemMap(): SystemMapPayload {
  return {
    generatedAt:  new Date().toISOString(),
    version:      "1.0.0",
    agents: {
      configured:  getAgentRegistry(),
      governance:  getAgents(),
    },
    engines: {
      scheduled:       ENGINE_REGISTRY,
      dependencyGraph: getEngineDependencyList(),
    },
    skills: {
      registry: SKILL_REGISTRY,
      versions: SKILL_VERSION_REGISTRY,
    },
    phases:         getPhaseRegistry(),
    circuitBreakers: getAllBreakerStates(),
    metrics:         getMetrics(),
  };
}
