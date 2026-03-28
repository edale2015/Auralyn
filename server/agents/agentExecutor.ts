import { getNextTask, recordProcessed } from "./taskBus";
import { getAgent, type Agent } from "./taskAgentRegistry";
import { publish } from "./eventBus";

let executorTimer: ReturnType<typeof setInterval> | null = null;

const TASK_TYPE_AGENT_MAP: Record<string, string> = {
  SAFETY_CHECK: "SafetyAgent",
  SRE_HEAL:     "SREAgent",
  ROUTING:      "RoutingAgent",
  REVENUE:      "RevenueAgent",
  LEARNING:     "LearningAgent",
  GOVERNANCE:   "GovernanceAgent",
  SIMULATION:   "SimulationAgent",
};

export async function runExecutorCycle(): Promise<void> {
  const task = getNextTask();
  if (!task) return;

  const agentName = TASK_TYPE_AGENT_MAP[task.type];
  if (!agentName) {
    console.warn(`[AgentExecutor] No agent mapped for task type: ${task.type}`);
    return;
  }

  const agent = getAgent(agentName);
  if (!agent) {
    console.warn(`[AgentExecutor] Agent not found in task registry: ${agentName}`);
    return;
  }

  const start = Date.now();
  try {
    agent.status = "busy";
    const result = await agent.run(task);
    agent.status = "idle";
    agent.lastRun = Date.now();
    const durationMs = Date.now() - start;

    recordProcessed(task, result);
    publish("task_processed", { type: task.type, agent: agentName, durationMs, success: true });

    console.log(`[AgentExecutor] ✅ ${agentName} → ${task.type} (${durationMs}ms)`);
  } catch (err: any) {
    agent.status = "error";
    const durationMs = Date.now() - start;
    recordProcessed(task, { error: err?.message });
    publish("task_failed", { type: task.type, agent: agentName, error: err?.message, durationMs });
    console.error(`[AgentExecutor] ❌ ${agentName} → ${task.type}: ${err?.message}`);
  }
}

export function startAgentExecutor(intervalMs = 1000) {
  if (executorTimer) return;
  executorTimer = setInterval(() => { runExecutorCycle().catch(() => {}); }, intervalMs);
  console.log(`[AgentExecutor] Started (${intervalMs}ms interval)`);
}

export function stopAgentExecutor() {
  if (executorTimer) { clearInterval(executorTimer); executorTimer = null; }
}
