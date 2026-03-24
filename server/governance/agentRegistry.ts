export type AgentHealth = "healthy" | "warning" | "critical";

export type Agent = {
  id: string;
  role: string;
  lastAction: any;
  health: AgentHealth;
  registeredAt: string;
  lastSeenAt: string;
};

const agents: Record<string, Agent> = {};

export function registerAgent(agent: Omit<Agent, "registeredAt" | "lastSeenAt">): void {
  const now = new Date().toISOString();
  agents[agent.id] = {
    ...agent,
    registeredAt: agents[agent.id]?.registeredAt ?? now,
    lastSeenAt: now,
  };
}

export function heartbeat(agentId: string, action?: any): void {
  const a = agents[agentId];
  if (a) {
    a.lastSeenAt = new Date().toISOString();
    if (action !== undefined) a.lastAction = action;
    a.health = "healthy";
  }
}

export function setAgentHealth(agentId: string, health: AgentHealth): void {
  const a = agents[agentId];
  if (a) a.health = health;
}

export function getAgents(): Agent[] {
  return Object.values(agents);
}

export function getAgent(id: string): Agent | undefined {
  return agents[id];
}

export function deregisterAgent(id: string): void {
  delete agents[id];
}

export function getAgentSummary() {
  const all = getAgents();
  return {
    total: all.length,
    healthy: all.filter((a) => a.health === "healthy").length,
    warning: all.filter((a) => a.health === "warning").length,
    critical: all.filter((a) => a.health === "critical").length,
    agents: all.map(({ id, role, health, lastSeenAt }) => ({ id, role, health, lastSeenAt })),
  };
}
