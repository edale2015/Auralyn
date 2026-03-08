import { listTools, executeTool } from "./toolRegistry";

export interface AgentTask {
  taskId: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  toolCalls: { toolId: string; params: Record<string, unknown>; result?: unknown }[];
  createdAt: string;
  completedAt?: string;
}

const tasks = new Map<string, AgentTask>();

export async function runAgentTask(instruction: string): Promise<AgentTask> {
  const task: AgentTask = {
    taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    instruction,
    status: "running",
    toolCalls: [],
    createdAt: new Date().toISOString(),
  };
  tasks.set(task.taskId, task);

  try {
    const availableTools = listTools();
    task.result = {
      message: "Task processed",
      instruction,
      availableTools: availableTools.map((t) => t.id),
      timestamp: new Date().toISOString(),
    };
    task.status = "completed";
    task.completedAt = new Date().toISOString();
  } catch (err: any) {
    task.status = "failed";
    task.error = err?.message ?? "Unknown error";
    task.completedAt = new Date().toISOString();
  }

  return task;
}

export function getTask(taskId: string): AgentTask | undefined { return tasks.get(taskId); }
export function listTasks(): AgentTask[] { return Array.from(tasks.values()).reverse(); }
