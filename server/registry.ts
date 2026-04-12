/**
 * Central agent registry for the DAG / YAML execution engine.
 * Agents are registered as factory functions so each pipeline gets fresh instances.
 */

import { RedFlagAgent } from "./agents/redFlagAgent";
import type { MedicalAgent } from "./core/MedicalAgent";

type AgentFactory = () => MedicalAgent;

const agentRegistry = new Map<string, AgentFactory>();

export function registerAgent(name: string, factory: AgentFactory): void {
  agentRegistry.set(name, factory);
}

export function getAgent(name: string): MedicalAgent {
  const factory = agentRegistry.get(name);
  if (!factory) {
    throw new Error(`Agent not found in registry: "${name}". Registered: [${[...agentRegistry.keys()].join(", ")}]`);
  }
  return factory();
}

export function listAgentContracts() {
  return [...agentRegistry.entries()].map(([name, factory]) => {
    const agent = factory();
    return { name, consumes: agent.meta.consumes, provides: agent.meta.provides };
  });
}

export function listAgentNames(): string[] {
  return [...agentRegistry.keys()];
}

// ── Default registrations ────────────────────────────────────────────────────
registerAgent("redFlag", () => new RedFlagAgent());
