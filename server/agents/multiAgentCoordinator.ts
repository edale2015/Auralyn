// ── MultiAgentCoordinator ──────────────────────────────────────────────────────
//
// O(1) Map-based task coordination with TTL eviction and size cap.
// Replaces the original O(n) array-scan implementation.
//
// Key design decisions:
//   1. Map<taskKey, AgentTask> → O(1) conflict detection, no linear scans.
//   2. Hard TTL per task — expired tasks auto-release without manual cleanup.
//   3. Periodic eviction (every 10 min) keeps memory bounded.
//   4. Hard size cap (10 000 active tasks) rejects overflow before Map grows.
//   5. Backward-compatible interface: assign/complete/fail/getSummary unchanged.

const MAX_ACTIVE_TASKS       = 10_000;
const DEFAULT_TASK_TTL_MS    = 5 * 60_000;   // 5 minutes
const EVICTION_INTERVAL_MS   = 10 * 60_000;  // evict every 10 minutes

interface AgentTask {
  agent:      string;
  task:       string;   // original field name kept for compat
  assignedAt: number;
  expiresAt:  number;
  status:     "active" | "completed" | "failed" | "expired";
}

export interface CoordinatorSummary {
  activeTasks:    AgentTask[];
  completedTasks: number;
  failedTasks:    number;
  expiredTasks:   number;
  totalAssigned:  number;
  agents:         string[];
  mapSize:        number;
}

export class MultiAgentCoordinator {
  // O(1) keyed by task string
  private readonly taskMap = new Map<string, AgentTask>();

  // Separate counters for terminal states so getSummary() stays O(active)
  private completedCount = 0;
  private failedCount    = 0;
  private expiredCount   = 0;

  private evictionTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.evictionTimer = setInterval(
      () => this._evictExpired(),
      EVICTION_INTERVAL_MS
    ).unref();
  }

  // ── assign ──────────────────────────────────────────────────────────────────
  assign(
    agent:  string,
    task:   string,
    ttlMs:  number = DEFAULT_TASK_TTL_MS
  ): { status: string; reason?: string } {

    // Hard cap — never let the Map grow unboundedly
    if (this.taskMap.size >= MAX_ACTIVE_TASKS) {
      return {
        status: "rejected",
        reason: `Coordinator at capacity (${MAX_ACTIVE_TASKS} active tasks)`,
      };
    }

    const existing = this.taskMap.get(task);
    if (existing && existing.status === "active") {
      if (Date.now() < existing.expiresAt) {
        return {
          status: "blocked",
          reason: `Task already assigned to ${existing.agent}`,
        };
      }
      // Expired — evict inline and fall through to reassign
      existing.status = "expired";
      this.expiredCount++;
      this.taskMap.delete(task);
    }

    const now = Date.now();
    this.taskMap.set(task, {
      agent,
      task,
      assignedAt: now,
      expiresAt:  now + ttlMs,
      status:     "active",
    });

    return { status: "assigned" };
  }

  // ── complete ─────────────────────────────────────────────────────────────────
  complete(agent: string, task: string): void {
    const entry = this.taskMap.get(task);
    if (entry && entry.agent === agent && entry.status === "active") {
      entry.status = "completed";
      this.completedCount++;
      this.taskMap.delete(task);
    }
  }

  // ── fail ─────────────────────────────────────────────────────────────────────
  fail(agent: string, task: string): void {
    const entry = this.taskMap.get(task);
    if (entry && entry.agent === agent && entry.status === "active") {
      entry.status = "failed";
      this.failedCount++;
      this.taskMap.delete(task);
    }
  }

  // ── getSummary ───────────────────────────────────────────────────────────────
  getSummary(): CoordinatorSummary {
    const active = Array.from(this.taskMap.values());
    const agents = [...new Set(active.map(t => t.agent))];
    return {
      activeTasks:    active,
      completedTasks: this.completedCount,
      failedTasks:    this.failedCount,
      expiredTasks:   this.expiredCount,
      totalAssigned:  this.completedCount + this.failedCount + this.expiredCount + active.length,
      agents,
      mapSize:        this.taskMap.size,
    };
  }

  // ── internal eviction ────────────────────────────────────────────────────────
  private _evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, task] of this.taskMap) {
      if (task.expiresAt <= now && task.status === "active") {
        this.taskMap.delete(key);
        this.expiredCount++;
        evicted++;
      }
    }
    if (evicted > 0) {
      console.log(`[Coordinator] Evicted ${evicted} expired task(s)`);
    }
  }

  // ── getActiveCount ───────────────────────────────────────────────────────────
  getActiveCount(): number { return this.taskMap.size; }

  // ── destroy ──────────────────────────────────────────────────────────────────
  destroy(): void { clearInterval(this.evictionTimer); }
}

export const multiAgentCoordinator = new MultiAgentCoordinator();

// Seed the four system tasks that were previously initialised inline
multiAgentCoordinator.assign("AutoDebugger",       "system_health_scan");
multiAgentCoordinator.assign("PredictiveEngine",   "failure_forecasting");
multiAgentCoordinator.assign("SimulationAgent",    "stress_test_generation");
multiAgentCoordinator.assign("LearningAgent",      "outcome_analysis");
multiAgentCoordinator.assign("GovernanceAgent",    "deployment_validation");
