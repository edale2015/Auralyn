/**
 * Agent Configuration Store
 *
 * - toggleAgent() writes a structured audit entry for every enable/disable
 * - Safety agent cannot be disabled (patient protection invariant)
 * - Agent config is persisted to Redis (Upstash) so restarts preserve overrides
 * - getAgentRegistry() / getAgentConfig() are equivalent aliases
 */

interface AgentConfigEntry {
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: string;
  reason?: string;
}

interface AgentToggleAuditEntry {
  agent:     string;
  action:    "enabled" | "disabled";
  by:        string;
  reason?:   string;
  timestamp: string;
}

const DEFAULT_CONFIG: Record<string, AgentConfigEntry> = {
  safety:    { enabled: true },
  triage:    { enabled: true },
  diagnosis: { enabled: true },
  risk:      { enabled: true },
  billing:   { enabled: true },
  followup:  { enabled: true },
};

const agentConfig: Record<string, AgentConfigEntry> = { ...DEFAULT_CONFIG };

const _auditLog: AgentToggleAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 500;

async function persistToRedis(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const value = encodeURIComponent(JSON.stringify(agentConfig));
    await fetch(`${url}/set/agent:config/${value}/EX/86400`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
}

async function loadFromRedis(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const res = await fetch(`${url}/get/agent:config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { result: string | null };
    if (json.result) {
      const loaded = JSON.parse(decodeURIComponent(json.result)) as Record<string, AgentConfigEntry>;
      for (const [name, cfg] of Object.entries(loaded)) {
        if (name === "safety") continue;
        agentConfig[name] = cfg;
      }
      console.log("[AgentConfig] Loaded persisted config from Redis");
    }
  } catch {}
}

loadFromRedis().catch(() => {});

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
  } catch {}
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
    agentConfig[name].disabledAt  = new Date().toISOString();
    agentConfig[name].disabledBy  = opts?.by || "system";
    agentConfig[name].reason      = opts?.reason;
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

  persistToRedis().catch(() => {});

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
