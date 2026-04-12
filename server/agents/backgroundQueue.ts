/**
 * Background Task Execution with Notifications
 *
 * Article: "When Claude runs a test suite, compiles a project, or performs a long
 *  database migration, it does not sit idle waiting for the result. It pushes the
 *  operation into the background, continues planning the next steps, and receives a
 *  notification when the operation completes."
 *
 * Clinical translation:
 *   Sepsis detection (10-15s) runs in background while digital twin simulation (5s)
 *   and differential scoring (3s) run concurrently. The orchestrator does not block
 *   on any of them — it dispatches all, then injects results as they arrive.
 *
 *   Unlike contextIsolatedRunner (which isolates AI agent contexts), this queue
 *   handles any async work and posts completions back as injectable notifications.
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "failed" | "timeout";

export interface BackgroundTask<T = any> {
  id:         string;
  label:      string;
  status:     BackgroundTaskStatus;
  queuedAt:   string;
  startedAt?: string;
  doneAt?:    string;
  result?:    T;
  error?:     string;
  durationMs?:number;
}

export interface TaskNotification<T = any> {
  taskId:    string;
  label:     string;
  status:    "completed" | "failed" | "timeout";
  result?:   T;
  error?:    string;
  durationMs?: number;
  timestamp: string;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const _tasks       = new Map<string, BackgroundTask>();
const _notifications: TaskNotification[] = [];

function _now(): string { return new Date().toISOString(); }

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Dispatch a clinical operation to run in the background.
 * Returns immediately with the task ID.
 * The result is posted to the notification queue when done.
 */
export function dispatch<T>(
  label:    string,
  fn:       () => Promise<T>,
  opts: { timeoutMs?: number } = {}
): BackgroundTask<T> {
  const task: BackgroundTask<T> = {
    id:       randomUUID().slice(0, 8),
    label,
    status:   "queued",
    queuedAt: _now(),
  };
  _tasks.set(task.id, task);

  const timeoutMs = opts.timeoutMs ?? 60_000;

  // Fire and forget — result lands in _notifications
  (async () => {
    task.status    = "running";
    task.startedAt = _now();
    const tStart   = Date.now();

    try {
      const withTimeout = Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      const result = await withTimeout;
      task.status    = "completed";
      task.result    = result;
      task.doneAt    = _now();
      task.durationMs = Date.now() - tStart;

      _notifications.push({
        taskId:    task.id,
        label:     task.label,
        status:    "completed",
        result,
        durationMs: task.durationMs,
        timestamp: _now(),
      });
    } catch (err: any) {
      const isTimeout = err?.message?.startsWith("Timeout");
      task.status    = isTimeout ? "timeout" : "failed";
      task.error     = err?.message ?? String(err);
      task.doneAt    = _now();
      task.durationMs = Date.now() - tStart;

      _notifications.push({
        taskId:    task.id,
        label:     task.label,
        status:    isTimeout ? "timeout" : "failed",
        error:     task.error,
        durationMs: task.durationMs,
        timestamp: _now(),
      });
    }
  })();

  return task;
}

// ── Notification drain ────────────────────────────────────────────────────────

/**
 * Drain all pending notifications (call this between agent turns).
 * Returns all notifications that arrived since the last drain.
 *
 * Article: "The agent loop drains the queue after every turn and injects
 *  any completed notifications as user messages."
 */
export function drainNotifications(): TaskNotification[] {
  if (_notifications.length === 0) return [];
  const drained = [..._notifications];
  _notifications.length = 0;
  return drained;
}

/**
 * Format a notification as a clinical context injection string.
 * This is what gets appended to the agent's conversation history.
 */
export function formatNotification(n: TaskNotification): string {
  const dur = n.durationMs ? ` (${n.durationMs}ms)` : "";
  if (n.status === "completed") {
    const preview = typeof n.result === "string"
      ? n.result.slice(0, 200)
      : JSON.stringify(n.result ?? {}).slice(0, 200);
    return `[Background task '${n.label}' COMPLETED${dur}]\n${preview}`;
  }
  if (n.status === "timeout") {
    return `[Background task '${n.label}' TIMED OUT${dur}] — partial results may be unavailable`;
  }
  return `[Background task '${n.label}' FAILED${dur}] — ${n.error ?? "unknown error"}`;
}

// ── Poll helpers ──────────────────────────────────────────────────────────────

/** Get the current status of a task by ID */
export function getTask<T = any>(taskId: string): BackgroundTask<T> | null {
  return (_tasks.get(taskId) as BackgroundTask<T>) ?? null;
}

/** Wait for a specific task to complete (blocks; use for sequential flows only) */
export async function awaitTask<T>(taskId: string, pollMs = 100, timeoutMs = 60_000): Promise<BackgroundTask<T>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = getTask<T>(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === "completed" || task.status === "failed" || task.status === "timeout") return task;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`awaitTask timeout after ${timeoutMs}ms for task ${taskId}`);
}

/** Wait for multiple tasks in parallel — returns when all are done */
export async function awaitAll<T>(taskIds: string[], timeoutMs = 60_000): Promise<BackgroundTask<T>[]> {
  return Promise.all(taskIds.map((id) => awaitTask<T>(id, 100, timeoutMs)));
}

/** List all tasks (for dashboard / audit) */
export function listTasks(): BackgroundTask[] {
  return [..._tasks.values()].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}
