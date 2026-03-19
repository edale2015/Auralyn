interface AgentConfigEntry {
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: string;
  reason?: string;
}

const agentConfig: Record<string, AgentConfigEntry> = {
  safety: { enabled: true },
  triage: { enabled: true },
  diagnosis: { enabled: true },
  risk: { enabled: true },
  billing: { enabled: true },
  followup: { enabled: true },
};

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

  return { success: true };
}

export function getAgentConfig(): Record<string, AgentConfigEntry> {
  return { ...agentConfig };
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
