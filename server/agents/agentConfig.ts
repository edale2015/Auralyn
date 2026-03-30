/**
 * Agent Configuration Store
 *
 * Rec 1:  toggleAgent() now writes a structured audit entry so every
 *         enable/disable is permanently traceable (who, when, why).
 * Rec 10: getAgentRegistry() alias added so systemMap.ts can import a
 *         consistent name without breaking existing callers of getAgentConfig().
 *
 * Note: state is in-memory. A Redis-persistence layer can be added by
 * importing getRedisAsync() and calling hset("agent:config", name, JSON)
 * on each toggle — gated behind the existing UPSTASH_REDIS_REST_URL env var.
 */

interface AgentConfigEntry {
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: string;
  reason?: string;
}

interface AgentToggleAuditEntry {
  agent:      string;
  action:     "enabled" | "disabled";
  by:         string;
  reason?:    string;
  timestamp:  string;
}

const agentConfig: Record<string, AgentConfigEntry> = {
  safety:    { enabled: true },
  triage:    { enabled: true },
  diagnosis: { enabled: true },
  risk:      { enabled: true },
  billing:   { enabled: true },
  followup:  { enabled: true },
};

const _auditLog: AgentToggleAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 500;

function writeToggleAudit(entry: AgentToggleAuditEntry) {
  _auditLog.push(entry);
  if (_auditLog.length > MAX_AUDIT_ENTRIES) _auditLog.shift();

  try {
    const { auditStep } = require("../audit/auditLogger") as typeof import("../audit/auditLogger");
    auditStep(`AGENT_${entry.action.toUpperCase()}`, {
      agent:     entry.agent,
      by:        entry.by,
      reason:    entry.reason,
      timestamp: entry.timestamp,
    });
  } catch {
  }
}

export function isAgentEnabled(name: string): boolean {
  return agentConfig[name]?.enabled ?? true;
}

export function toggleAgent(
  name: string,
  enabled: boolean,
  opts?: { by?: string; reason?: string },
): { success: boolean; error?: string } {
  if (name === "safety" && !enabled) {
    return { success: false, error: "Safety agent cannot be disabled — required for patient protection" };
  }

  if (!agentConfig[name]) {
    agentConfig[name] = { enabled: true };
  }

  agentConfig[name].enabled = enabled;
  if (!enabled) {
    agentConfig[name].disabledAt = new Date().toISOString();
    agentConfig[name].disabledBy = opts?.by || "system";
    agentConfig[name].reason = opts?.reason;
  } else {
    delete agentConfig[name].disabledAt;
    delete agentConfig[name].disabledBy;
    delete agentConfig[name].reason;
  }

  writeToggleAudit({
    agent:     name,
    action:    enabled ? "enabled" : "disabled",
    by:        opts?.by ?? "system",
    reason:    opts?.reason,
    timestamp: new Date().toISOString(),
  });

  return { success: true };
}

export function getAgentConfig(): Record<string, AgentConfigEntry> {
  return { ...agentConfig };
}

export function getAgentRegistry(): Record<string, AgentConfigEntry> {
  return getAgentConfig();
}

export function getAgentToggleAuditLog(): AgentToggleAuditEntry[] {
  return [..._auditLog];
}

export function bulkToggleAgents(
  updates: Array<{ name: string; enabled: boolean }>,
  opts?: { by?: string },
): Array<{ name: string; success: boolean; error?: string }> {
  return updates.map((u) => {
    const result = toggleAgent(u.name, u.enabled, { by: opts?.by });
    return { name: u.name, ...result };
  });
}
