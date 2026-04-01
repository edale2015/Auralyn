const FALLBACK_MAP: Record<string, string> = {
  diagnosis: "rule_based_diagnosis",
  scoring: "basic_scoring",
  billing: "safe_billing",
  safety: "strict_safety",
  learning: "frozen_learning",
  routing: "round_robin_routing",
};

export interface RerouteEvent {
  agent: string;
  fromMode: string;
  toMode: string;
  reason: string;
  timestamp: string;
}

const rerouteLog: RerouteEvent[] = [];

export function rerouteDecision(agent: string, reason: string = "risk threshold exceeded"): RerouteEvent | null {
  const fallback = FALLBACK_MAP[agent];
  if (!fallback) return null;

  const event: RerouteEvent = {
    agent,
    fromMode: "primary",
    toMode: fallback,
    reason,
    timestamp: new Date().toISOString(),
  };

  rerouteLog.push(event);
  if (rerouteLog.length > 100) rerouteLog.shift();

  (globalThis as any)["ACTIVE_AGENT_OVERRIDE"] = {
    ...((globalThis as any)["ACTIVE_AGENT_OVERRIDE"] || {}),
    [agent]: fallback,
  };

  console.log(`[Governor] Rerouting ${agent} → ${fallback} (${reason})`);
  return event;
}

export function restoreAgent(agent: string): boolean {
  const overrides = (globalThis as any)["ACTIVE_AGENT_OVERRIDE"] ?? {};
  if (!overrides[agent]) return false;
  delete overrides[agent];
  (globalThis as any)["ACTIVE_AGENT_OVERRIDE"] = overrides;
  console.log(`[Governor] Restoring ${agent} to primary mode`);
  return true;
}

export function getActiveOverrides(): Record<string, string> {
  return { ...((globalThis as any)["ACTIVE_AGENT_OVERRIDE"] ?? {}) };
}

export function getRerouteLog(limit = 50): RerouteEvent[] {
  return rerouteLog.slice(-limit);
}
