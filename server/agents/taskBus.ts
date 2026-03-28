export type TaskType =
  | "SAFETY_CHECK"
  | "SRE_HEAL"
  | "ROUTING"
  | "REVENUE"
  | "LEARNING"
  | "GOVERNANCE"
  | "SIMULATION";

export interface Task {
  id: string;
  type: TaskType;
  payload: any;
  priority: number;
  createdAt: number;
  source?: string;
}

const queue: Task[] = [];
const processedLog: Array<Task & { processedAt: number; result: any }> = [];
const MAX_LOG = 200;

export function addTask(task: Omit<Task, "id" | "createdAt"> & { id?: string }): Task {
  const full: Task = {
    id: task.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    ...task,
  };
  queue.push(full);
  queue.sort((a, b) => b.priority - a.priority);
  return full;
}

export function getNextTask(): Task | undefined {
  return queue.shift();
}

export function peekQueue(): Task[] {
  return queue.slice(0, 20);
}

export function getQueueDepth(): number {
  return queue.length;
}

export function recordProcessed(task: Task, result: any) {
  processedLog.push({ ...task, processedAt: Date.now(), result });
  if (processedLog.length > MAX_LOG) processedLog.shift();
}

export function getProcessedLog(limit = 50) {
  return processedLog.slice(-limit).reverse();
}

export function getTaskBusStats() {
  return {
    queueDepth: queue.length,
    processed: processedLog.length,
    byType: processedLog.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}
