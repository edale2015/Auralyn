import { registerAgent, runAgents, getRegisteredAgents, type AgentContext } from "../agents/orchestrator";
import { decideNextActions, type DecisionResult } from "../agents/decisionEngine";
import { triageAgent } from "../agents/triageAgent";
import { diagnosisAgent } from "../agents/diagnosisAgent";
import { safetyAgent } from "../agents/safetyAgent";
import { billingAgent } from "../agents/billingAgent";
import { followUpAgent } from "../agents/followUpAgent";
import { riskAgent } from "../agents/riskAgent";
import { publish } from "../agents/eventBus";

let initialized = false;

export function initAutonomousAgents() {
  if (initialized) return;

  registerAgent(safetyAgent);
  registerAgent(triageAgent);
  registerAgent(diagnosisAgent);
  registerAgent(riskAgent);
  registerAgent(billingAgent);
  registerAgent(followUpAgent);

  initialized = true;
}

export interface AutonomousResult {
  agentResults: Record<string, any>;
  agentErrors: Record<string, string>;
  decision: DecisionResult;
  executionOrder: string[];
  durationMs: number;
  registeredAgents: string[];
}

export async function runAutonomousAgents(input: AgentContext): Promise<AutonomousResult> {
  initAutonomousAgents();

  publish("pipeline:start", { text: input.text, patientId: input.patientId, channel: input.channel });

  const { results, errors, executionOrder, durationMs } = await runAgents(input);

  const decision = decideNextActions(results, errors);

  publish("pipeline:complete", {
    durationMs,
    agentCount: executionOrder.length,
    priority: decision.priority,
    actions: decision.actions,
  });

  return {
    agentResults: results,
    agentErrors: errors,
    decision,
    executionOrder,
    durationMs,
    registeredAgents: getRegisteredAgents(),
  };
}
