/**
 * Dependency-Ordered Wave Executor (GSD-style)
 * Extends contextIsolatedRunner with topological ordering.
 *
 * Wave 1: Independent tasks (no deps) run in parallel, isolated contexts.
 * Wave 2: Tasks whose deps are all satisfied run in parallel.
 * Wave N: Tasks requiring all prior waves.
 *
 * Clinical example:
 *   Wave 1: scoring, labs, imaging (independent)
 *   Wave 2: diagnosis (depends on scoring + labs)
 *   Wave 3: disposition (depends on diagnosis)
 *
 * Each task still runs in its own fresh UUID context — zero memory carryover.
 * Results from prior waves are PASSED IN as input, not in shared memory.
 */

import { randomUUID } from "crypto";

export interface DependentTask<T = any> {
  name:     string;
  deps?:    string[];            // names of tasks that must complete first
  execute:  (inputs: DepsInput) => Promise<T>;
}

export interface DepsInput {
  contextId: string;
  startedAt: number;
  /** Results from all completed tasks so far — passed in, not a shared ref */
  completed: Record<string, any>;
}

export interface DependentTaskResult {
  name:       string;
  contextId:  string;
  wave:       number;
  status:     "success" | "error";
  result?:    any;
  error?:     string;
  durationMs: number;
}

export interface DependencyWaveResult {
  waveRunId:  string;
  waves:      number;
  tasks:      Record<string, DependentTaskResult>;
  allPassed:  boolean;
  startedAt:  string;
  durationMs: number;
}

/** Build topological wave buckets — throws if a cycle is detected */
function buildWaveBuckets(tasks: DependentTask[]): DependentTask[][] {
  const nameSet = new Set(tasks.map((t) => t.name));

  // Validate all dep names exist
  for (const t of tasks) {
    for (const dep of t.deps ?? []) {
      if (!nameSet.has(dep)) throw new Error(`Task "${t.name}" depends on unknown task "${dep}"`);
    }
  }

  const remaining = new Set(tasks.map((t) => t.name));
  const completed = new Set<string>();
  const waves:     DependentTask[][] = [];

  let safety = 0;
  while (remaining.size > 0) {
    if (++safety > tasks.length + 2) throw new Error("Cycle detected in task dependency graph");

    const wave = tasks.filter(
      (t) =>
        remaining.has(t.name) &&
        (t.deps ?? []).every((dep) => completed.has(dep))
    );

    if (wave.length === 0)
      throw new Error(
        `Cannot resolve dependencies — tasks remaining: ${[...remaining].join(", ")}`
      );

    waves.push(wave);
    for (const t of wave) {
      remaining.delete(t.name);
      completed.add(t.name);
    }
  }

  return waves;
}

export async function runDependencyWave(
  tasks: DependentTask[]
): Promise<DependencyWaveResult> {
  const waveRunId = randomUUID();
  const start     = Date.now();
  const buckets   = buildWaveBuckets(tasks);
  const results:  Record<string, DependentTaskResult> = {};

  let waveNumber = 0;

  for (const bucket of buckets) {
    waveNumber++;
    const snapshot = Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.result])
    );

    const waveResults = await Promise.all(
      bucket.map(async (task): Promise<DependentTaskResult> => {
        const contextId = randomUUID();
        const taskStart = Date.now();
        const inputs: DepsInput = {
          contextId,
          startedAt: taskStart,
          completed: snapshot,   // immutable snapshot — not a live ref
        };

        try {
          const result = await task.execute(inputs);
          return {
            name: task.name, contextId, wave: waveNumber,
            status: "success", result, durationMs: Date.now() - taskStart,
          };
        } catch (err: any) {
          return {
            name: task.name, contextId, wave: waveNumber,
            status: "error", error: err?.message ?? String(err),
            durationMs: Date.now() - taskStart,
          };
        }
      })
    );

    for (const r of waveResults) results[r.name] = r;
  }

  return {
    waveRunId,
    waves:      buckets.length,
    tasks:      results,
    allPassed:  Object.values(results).every((r) => r.status === "success"),
    startedAt:  new Date(start).toISOString(),
    durationMs: Date.now() - start,
  };
}
