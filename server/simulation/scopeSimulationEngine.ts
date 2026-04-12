/**
 * Scope Simulation Engine — "what if" scenario testing for FDA validation
 * Test what happens if an agent had different permissions, without side effects.
 */

import { AgentScopeEngine, MEDICAL_SCOPE_RULES, type ActionRequest, type ScopeRule } from "../scope/agentScopeEngine";

export interface SimulationScenario {
  name:     string;
  actions:  ActionRequest[];
  overrides?:Record<string, Partial<ScopeRule>>;
}

export interface SimulationResult {
  action:    string;
  agentRole: string;
  allowed:   boolean;
  reason?:   string;
}

export interface SimulationReport {
  scenario:    string;
  results:     SimulationResult[];
  allowedCount:number;
  blockedCount:number;
  summary:     string;
}

// ── Run a simulation without affecting the live engine ──────────────────────
export function simulateScope(actions: ActionRequest[], overrideRules?: Partial<ScopeRule>[]): SimulationResult[] {
  // Clone scope rules
  const rules = MEDICAL_SCOPE_RULES.map((r) => ({ ...r }));
  const simEngine = new AgentScopeEngine(rules);

  // Apply overrides if provided (e.g., grant extra permissions for simulation)
  if (overrideRules) {
    for (const override of overrideRules) {
      if (override.role) {
        const existing = simEngine.getRole(override.role);
        if (existing) {
          simEngine.addRole({ ...existing, ...override });
        }
      }
    }
  }

  return actions.map((action) => {
    const result = simEngine.evaluate(action);
    return { action: action.action, agentRole: action.agentRole, allowed: result.allowed, reason: result.reason };
  });
}

export function runScenario(scenario: SimulationScenario): SimulationReport {
  const overrideRules = scenario.overrides
    ? Object.entries(scenario.overrides).map(([role, patch]) => ({ role, ...patch } as Partial<ScopeRule>))
    : undefined;

  const results      = simulateScope(scenario.actions, overrideRules);
  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.length - allowedCount;

  return {
    scenario:     scenario.name,
    results,
    allowedCount,
    blockedCount,
    summary: `${allowedCount}/${results.length} actions allowed (${Math.round(allowedCount / Math.max(results.length, 1) * 100)}%)`,
  };
}

// ── Auto minimizer: recommend removing unused permissions ────────────────────
export function recommendScopeMinimization(
  usageLog: Array<{ agentRole: string; action: string; used: boolean }>
): Record<string, string[]> {
  const unused: Record<string, string[]> = {};

  for (const entry of usageLog) {
    if (!entry.used) {
      if (!unused[entry.agentRole]) unused[entry.agentRole] = [];
      if (!unused[entry.agentRole].includes(entry.action)) {
        unused[entry.agentRole].push(entry.action);
      }
    }
  }

  return unused;
}
