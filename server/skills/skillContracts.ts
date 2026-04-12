/**
 * Typed Skill Contracts (NeuroCore-style)
 * Every skill declares what context keys it PROVIDES and CONSUMES.
 * The pipeline validator catches mismatches BEFORE any API call runs.
 *
 * Principle from the article:
 *   "LangChain discovers these failures when the chain runs.
 *    NeuroCore discovers them when it validates the blueprint."
 *
 * Clinical translation:
 *   A skill that reads "sepsis_score" but no upstream skill writes it
 *   is caught during pipeline construction — not when a patient is waiting.
 */

import { randomUUID } from "crypto";

// ── Skill Contract ────────────────────────────────────────────────────────────

export interface SkillMeta {
  name:        string;
  version:     string;
  description: string;
  provides:    string[];       // context keys this skill writes
  consumes:    string[];       // context keys this skill reads (must be upstream)
  maxRetries?: number;         // default 3
  retryDelayBase?: number;     // seconds, default 1.0
  retryOn?:    string[];       // error class names to retry on
}

export interface FlowContext {
  readonly runId:  string;
  readonly data:   Record<string, any>;
  get(key: string): any;
  set(key: string, value: any): void;
  has(key: string): boolean;
  keys(): string[];
  snapshot(): Record<string, any>;
}

export interface AsyncSkill {
  readonly meta: SkillMeta;
  process(ctx: FlowContext): Promise<FlowContext>;
}

// ── Flow Context Implementation ───────────────────────────────────────────────

export function createFlowContext(
  initial: Record<string, any> = {},
  runId = randomUUID()
): FlowContext {
  const _data: Record<string, any> = { ...initial };
  return {
    runId,
    get data() { return { ..._data }; },
    get(key)  { return _data[key]; },
    set(key, value) { _data[key] = value; },
    has(key)  { return key in _data; },
    keys()    { return Object.keys(_data); },
    snapshot(){ return { ..._data }; },
  };
}

// ── Pipeline Blueprint ────────────────────────────────────────────────────────

export interface SkillNode {
  skillName: string;
  deps?:     string[];         // skill names that must complete first
}

export interface PipelineBlueprint {
  name:    string;
  version: string;
  skills:  SkillNode[];
}

// ── Contract Validation ───────────────────────────────────────────────────────

export interface ContractViolation {
  skill:     string;
  key:       string;
  reason:    string;
}

export interface ValidationResult {
  valid:      boolean;
  violations: ContractViolation[];
  summary:    string;
}

/**
 * Validate that every key a skill CONSUMES is either:
 *   a) provided by an upstream skill (respecting deps order), or
 *   b) present in the initial context seed
 *
 * Runs in O(n) — pure in-memory, zero API calls.
 */
export function validatePipeline(
  blueprint:    PipelineBlueprint,
  skills:       Map<string, AsyncSkill>,
  initialKeys:  string[] = []
): ValidationResult {
  const violations: ContractViolation[] = [];
  const available   = new Set<string>(initialKeys);
  const ordered     = topologicalOrder(blueprint);

  for (const node of ordered) {
    const skill = skills.get(node.skillName);
    if (!skill) {
      violations.push({
        skill:  node.skillName,
        key:    "*",
        reason: `Skill "${node.skillName}" is declared in blueprint but not registered`,
      });
      continue;
    }

    // Check every consumed key is available from prior skills or initial context
    for (const key of skill.meta.consumes) {
      if (!available.has(key)) {
        violations.push({
          skill:  node.skillName,
          key,
          reason: `Skill "${node.skillName}" consumes "${key}" but no upstream skill provides it`,
        });
      }
    }

    // After this skill runs, its provided keys become available
    for (const key of skill.meta.provides) {
      available.add(key);
    }
  }

  const valid = violations.length === 0;
  return {
    valid,
    violations,
    summary: valid
      ? `Pipeline "${blueprint.name}" v${blueprint.version} — all ${ordered.length} skill contracts satisfied`
      : `Pipeline "${blueprint.name}" — ${violations.length} contract violation(s): ${violations.map((v) => `${v.skill}:${v.key}`).join(", ")}`,
  };
}

/** Topological sort of skill nodes respecting deps */
function topologicalOrder(blueprint: PipelineBlueprint): SkillNode[] {
  const nodeMap = new Map(blueprint.skills.map((n) => [n.skillName, n]));
  const result:  SkillNode[] = [];
  const visited  = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    const node = nodeMap.get(name);
    if (!node) return;
    for (const dep of node.deps ?? []) visit(dep);
    visited.add(name);
    result.push(node);
  }

  for (const node of blueprint.skills) visit(node.skillName);
  return result;
}

// ── Pipeline Executor ─────────────────────────────────────────────────────────

export interface ExecutionEvent {
  skillName:  string;
  status:     "started" | "completed" | "failed" | "retrying";
  attempt?:   number;
  durationMs?: number;
  error?:     string;
  timestamp:  string;
}

export interface PipelineResult {
  runId:      string;
  blueprint:  string;
  success:    boolean;
  context:    Record<string, any>;
  events:     ExecutionEvent[];
  durationMs: number;
}

export async function executePipeline(
  blueprint: PipelineBlueprint,
  skills:    Map<string, AsyncSkill>,
  initial:   Record<string, any> = {},
  onEvent?:  (e: ExecutionEvent) => void
): Promise<PipelineResult> {
  const runId    = randomUUID();
  const ctx      = createFlowContext(initial, runId);
  const events:  ExecutionEvent[] = [];
  const pStart   = Date.now();

  const emit = (e: ExecutionEvent) => {
    events.push(e);
    onEvent?.(e);
  };

  const ordered = topologicalOrder(blueprint);

  for (const node of ordered) {
    const skill = skills.get(node.skillName);
    if (!skill) {
      emit({ skillName: node.skillName, status: "failed", error: "not registered", timestamp: new Date().toISOString() });
      continue;
    }

    const maxRetries    = skill.meta.maxRetries ?? 3;
    const retryDelayBase= skill.meta.retryDelayBase ?? 1.0;
    let   lastError:    Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Full jitter exponential backoff (NeuroCore pattern)
        const raw    = retryDelayBase * Math.pow(2, attempt - 1);
        const capped = Math.min(raw, 30);
        const jitter = Math.random() * capped;
        emit({ skillName: node.skillName, status: "retrying", attempt, timestamp: new Date().toISOString() });
        await new Promise((r) => setTimeout(r, jitter * 1000));
      }

      const tStart = Date.now();
      emit({ skillName: node.skillName, status: "started", attempt, timestamp: new Date().toISOString() });

      try {
        await skill.process(ctx);
        emit({ skillName: node.skillName, status: "completed", durationMs: Date.now() - tStart, timestamp: new Date().toISOString() });
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        emit({ skillName: node.skillName, status: "failed", error: err?.message, durationMs: Date.now() - tStart, timestamp: new Date().toISOString() });
        if (attempt === maxRetries) break;
      }
    }
  }

  return {
    runId,
    blueprint: blueprint.name,
    success:   !events.some((e) => e.status === "failed"),
    context:   ctx.snapshot(),
    events,
    durationMs: Date.now() - pStart,
  };
}
