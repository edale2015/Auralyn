import { addTask, type Task, type TaskType } from "./taskBus";

const TASK_AGENT_MAP: Record<TaskType, string> = {
  SAFETY_CHECK: "SafetyAgent",
  SRE_HEAL:     "SREAgent",
  ROUTING:      "RoutingAgent",
  REVENUE:      "RevenueAgent",
  LEARNING:     "LearningAgent",
  GOVERNANCE:   "GovernanceAgent",
  SIMULATION:   "SimulationAgent",
};

export function getAgentForTask(taskType: TaskType): string {
  return TASK_AGENT_MAP[taskType] ?? "AutoDebugger";
}

/**
 * Route a clinical input to all relevant agents via the task bus.
 * Safety always dispatched first (priority 10).
 */
export function routeTasks(input: any, source = "pipeline"): Task[] {
  const tasks: Task[] = [
    addTask({ type: "SAFETY_CHECK", payload: input, priority: 10, source }),
    addTask({ type: "ROUTING",      payload: input, priority: 8,  source }),
    addTask({ type: "REVENUE",      payload: input, priority: 5,  source }),
    addTask({ type: "LEARNING",     payload: input, priority: 3,  source }),
  ];
  return tasks;
}

/**
 * Dispatch a single targeted task to the bus.
 */
export function dispatchTask(
  type: TaskType,
  payload: any,
  priority = 5,
  source = "manual"
): Task {
  return addTask({ type, payload, priority, source });
}
