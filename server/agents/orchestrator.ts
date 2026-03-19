export interface AgentContext {
  text: string;
  patientId?: string;
  answers?: Record<string, string>;
  channel?: "web" | "telegram" | "whatsapp";
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  [key: string]: any;
}

export interface Agent {
  name: string;
  priority: number;
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
}

const agents: Agent[] = [];

export function registerAgent(agent: Agent) {
  const existing = agents.findIndex((a) => a.name === agent.name);
  if (existing >= 0) agents[existing] = agent;
  else agents.push(agent);
  agents.sort((a, b) => a.priority - b.priority);
}

export function getRegisteredAgents(): string[] {
  return agents.map((a) => a.name);
}

export async function runAgents(context: AgentContext): Promise<{
  results: Record<string, AgentOutput>;
  errors: Record<string, string>;
  executionOrder: string[];
  durationMs: number;
}> {
  const results: Record<string, AgentOutput> = {};
  const errors: Record<string, string> = {};
  const executionOrder: string[] = [];
  const start = Date.now();

  const { isAgentEnabled } = await import("./agentConfig");

  for (const agent of agents) {
    if (!isAgentEnabled(agent.name)) {
      executionOrder.push(`${agent.name}:SKIPPED`);
      continue;
    }

    try {
      const output = await agent.run(context, results);
      results[agent.name] = output;
      executionOrder.push(agent.name);
    } catch (err: any) {
      errors[agent.name] = err.message || "Unknown agent error";
      executionOrder.push(`${agent.name}:FAILED`);
      const { logAgent: trackAgent } = await import("./tracking");
      trackAgent(agent.name, { error: err.message }, Date.now() - start, "error", err.message);
    }
  }

  return { results, errors, executionOrder, durationMs: Date.now() - start };
}
