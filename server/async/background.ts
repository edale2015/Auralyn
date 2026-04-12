import { bus } from "../events/eventBus";

export interface BackgroundTask {
  name:      string;
  startedAt: Date;
  status:    "running" | "complete" | "failed";
  result?:   unknown;
  error?:    string;
}

const _taskRegistry: Map<string, BackgroundTask> = new Map();

export function runBackground<T>(
  name: string,
  fn: () => Promise<T>
): string {
  const taskId = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const task: BackgroundTask = {
    name,
    startedAt: new Date(),
    status:    "running",
  };

  _taskRegistry.set(taskId, task);
  bus.emit("background_started", { taskId, name });

  // Fire-and-forget via setTimeout(0) to yield to the event loop
  setTimeout(async () => {
    try {
      const result  = await fn();
      task.status   = "complete";
      task.result   = result;
      bus.emit("background_complete", { taskId, name, result });
    } catch (err: any) {
      task.status = "failed";
      task.error  = err?.message ?? "Unknown error";
      bus.emit("background_failed", { taskId, name, error: task.error });
    }
  }, 0);

  return taskId;
}

export function getBackgroundTask(taskId: string): BackgroundTask | undefined {
  return _taskRegistry.get(taskId);
}

export function listBackgroundTasks(): BackgroundTask[] {
  return [..._taskRegistry.values()];
}
