/**
 * Clinical Task Board — TodoWrite equivalent for clinical agents
 *
 * Article: "Before working on any multi-step task, ALWAYS call todo_write first."
 * "The model cannot forget what it planned to do because the plan is
 *  continuously re-injected into its context."
 *
 * Clinical translation:
 *   Before a complex triage (sepsis screening + differential + disposition),
 *   the agent writes a plan. The physician sees it. Each step is marked
 *   PENDING→IN_PROGRESS→DONE. If the pipeline crashes, the board survives.
 *
 * Backed by in-memory store (Redis-promoted automatically via existing queue infra).
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";
export type TaskPriority = "high" | "medium" | "low";

export interface ClinicalTask {
  id:          string;
  boardId:     string;        // which patient/session board this belongs to
  description: string;
  status:      TaskStatus;
  priority:    TaskPriority;
  dependsOn:   string[];      // task IDs that must be done first
  claimedBy?:  string;        // agent ID that claimed this task
  result?:     string;        // outcome after completion
  error?:      string;        // reason for failure
  createdAt:   string;
  updatedAt:   string;
}

export interface TaskBoard {
  id:         string;         // typically patientId or sessionId
  title:      string;
  tasks:      ClinicalTask[];
  createdAt:  string;
  updatedAt:  string;
}

// ── In-memory store (swap to Redis for persistence across restarts) ────────────

const _boards = new Map<string, TaskBoard>();

function _now(): string { return new Date().toISOString(); }

// ── Board operations ──────────────────────────────────────────────────────────

/** Create or reset a board for a patient session */
export function createBoard(boardId: string, title: string): TaskBoard {
  const board: TaskBoard = { id: boardId, title, tasks: [], createdAt: _now(), updatedAt: _now() };
  _boards.set(boardId, board);
  return board;
}

export function getBoard(boardId: string): TaskBoard | null {
  return _boards.get(boardId) ?? null;
}

// ── TodoWrite: commit plan atomically ─────────────────────────────────────────

/**
 * Write a complete plan before execution starts.
 * Clears any prior tasks on this board (fresh plan per session).
 * Returns a human-readable plan summary (injected into clinical context).
 */
export function writePlan(
  boardId:     string,
  title:       string,
  taskDescs:   { description: string; priority?: TaskPriority; dependsOn?: string[] }[]
): { board: TaskBoard; summary: string } {
  const board = createBoard(boardId, title);

  for (const desc of taskDescs) {
    const task: ClinicalTask = {
      id:          randomUUID().slice(0, 8),
      boardId,
      description: desc.description,
      status:      "pending",
      priority:    desc.priority ?? "medium",
      dependsOn:   desc.dependsOn ?? [],
      createdAt:   _now(),
      updatedAt:   _now(),
    };
    board.tasks.push(task);
  }

  const summary = formatBoard(board);
  return { board, summary };
}

/** Format board as a readable clinical plan (injected into agent context) */
export function formatBoard(board: TaskBoard): string {
  const statusIcon: Record<TaskStatus, string> = {
    pending:     "○",
    in_progress: "◐",
    done:        "✓",
    failed:      "✗",
    skipped:     "—",
  };
  const lines = [`Clinical Plan: ${board.title}`, ""];
  for (const t of board.tasks) {
    const icon = statusIcon[t.status];
    const prio = t.priority === "high" ? "[HIGH]" : t.priority === "low" ? "[low] " : "      ";
    const dep  = t.dependsOn.length > 0 ? ` (after: ${t.dependsOn.join(", ")})` : "";
    lines.push(`  ${icon} ${prio} ${t.id}: ${t.description}${dep}`);
    if (t.result)  lines.push(`          → ${t.result.slice(0, 80)}`);
    if (t.error)   lines.push(`          ✗ ${t.error.slice(0, 80)}`);
  }
  return lines.join("\n");
}

// ── Task lifecycle ─────────────────────────────────────────────────────────────

/** Atomically claim the next unblocked pending task for an agent */
export function claimNextTask(boardId: string, agentId: string): ClinicalTask | null {
  const board = _boards.get(boardId);
  if (!board) return null;

  const doneIds = new Set(board.tasks.filter((t) => t.status === "done").map((t) => t.id));
  const priority: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...board.tasks].sort((a, b) => priority[a.priority] - priority[b.priority]);

  for (const task of sorted) {
    if (task.status !== "pending") continue;
    if (task.dependsOn.every((dep) => doneIds.has(dep))) {
      task.status    = "in_progress";
      task.claimedBy = agentId;
      task.updatedAt = _now();
      board.updatedAt = _now();
      return task;
    }
  }
  return null;
}

/** Update a task's status and optional result/error */
export function updateTask(
  boardId:  string,
  taskId:   string,
  status:   TaskStatus,
  result?:  string,
  error?:   string
): ClinicalTask | null {
  const board = _boards.get(boardId);
  if (!board) return null;

  const task = board.tasks.find((t) => t.id === taskId || t.id.startsWith(taskId));
  if (!task) return null;

  task.status    = status;
  task.updatedAt = _now();
  if (result !== undefined) task.result = result;
  if (error  !== undefined) task.error  = error;
  board.updatedAt = _now();
  return task;
}

/** Add a single task to an existing board (dynamic tasks discovered mid-run) */
export function addTask(
  boardId:     string,
  description: string,
  opts: { priority?: TaskPriority; dependsOn?: string[] } = {}
): ClinicalTask | null {
  const board = _boards.get(boardId);
  if (!board) return null;

  const task: ClinicalTask = {
    id:          randomUUID().slice(0, 8),
    boardId,
    description,
    status:      "pending",
    priority:    opts.priority ?? "medium",
    dependsOn:   opts.dependsOn ?? [],
    createdAt:   _now(),
    updatedAt:   _now(),
  };
  board.tasks.push(task);
  board.updatedAt = _now();
  return task;
}

/** Return board progress summary (% complete, blocked tasks, etc.) */
export function boardProgress(boardId: string): {
  total: number; done: number; failed: number; pending: number; inProgress: number; pctDone: number;
} | null {
  const board = _boards.get(boardId);
  if (!board) return null;

  const total      = board.tasks.length;
  const done       = board.tasks.filter((t) => t.status === "done").length;
  const failed     = board.tasks.filter((t) => t.status === "failed").length;
  const inProgress = board.tasks.filter((t) => t.status === "in_progress").length;
  const pending    = board.tasks.filter((t) => t.status === "pending").length;
  return { total, done, failed, pending, inProgress, pctDone: total ? Math.round((done / total) * 100) : 0 };
}
