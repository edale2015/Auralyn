import { listAgentContracts } from "../registry";
import type { DAGExecutor } from "../core/DAGExecutor";

export interface AgentContract {
  name:     string;
  consumes: string[];
  provides: string[];
}

/**
 * Return the meta contracts for all registered agents.
 */
export function getAgentContracts(): AgentContract[] {
  return listAgentContracts();
}

/**
 * Build a DAG description from a list of agent metas (can be used client-side for rendering).
 */
export function buildDAGFromContracts(contracts: AgentContract[]) {
  const nodes = contracts.map((c) => ({ id: c.name, type: "agent" }));

  // Add data nodes
  const dataKeys = new Set<string>();
  for (const c of contracts) {
    for (const k of [...c.consumes, ...c.provides]) dataKeys.add(k);
  }
  for (const k of dataKeys) nodes.push({ id: k, type: "data" });

  const edges = contracts.flatMap((c) => [
    ...c.consumes.map((k) => ({ from: k,     to: c.name, label: "input"  })),
    ...c.provides.map((k) => ({ from: c.name, to: k,     label: "output" })),
  ]);

  return { nodes, edges };
}
