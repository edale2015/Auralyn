/**
 * Execution Inspector (LangSmith equivalent)
 *
 * Article — LangSmith:
 *   "LangSmith shows you what your AI is actually doing, step by step.
 *   Every time your AI chain runs, LangSmith captures: the input sent to each
 *   step, the output produced, the latency, the token usage, the model used,
 *   and any errors. You can replay a run to debug it. You can compare runs
 *   side by side. You can set up evaluators that automatically score outputs."
 *
 * What's already present:
 *   - traceEngine.ts       — SHA-256 hash traces for immutability/integrity
 *   - auditTraceService    — step-level audit: startStep/completeStep/failStep
 *   - complaintNodeRunner.ts — nodeTraces (exist but not queryably exposed)
 *   - auditLogger.ts       — write-only audit log
 *
 * What's missing:
 *   The article's core LangSmith value: queryable, human-readable execution
 *   debugging. "What happened in run X at node Y? What input did it receive?
 *   What did it output? How long did it take? Did it error?" Our existing
 *   tracing records integrity (hashes) but doesn't expose the data at each step
 *   for debugging and comparison.
 *
 * This module adds:
 *   1. ExecutionRun store — in-memory (extendable to Redis/DB) per-run record
 *   2. Node-level capture — input, output, latency, model, token estimate, error
 *   3. Query API — getRunById, listRuns, compareRuns, getNode
 *   4. Run replay descriptor — what would need to be re-sent to reproduce
 *   5. Auto-evaluator hooks — score output quality per step
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeStatus = "pending" | "running" | "success" | "error" | "skipped";

export interface NodeRecord {
  nodeId:       string;
  nodeName:     string;
  nodeType:     string;      // e.g. "llm", "tool", "condition", "retriever", "step"
  status:       NodeStatus;
  input:        unknown;
  output:       unknown;
  error?:       string;
  startedAt:    string;
  completedAt?: string;
  latencyMs?:   number;
  model?:       string;      // which LLM model was called (if any)
  tokenEstimate?:number;     // rough estimate
  evaluationScore?: number;  // 0–1 auto-evaluator score (if set)
  metadata?:    Record<string, unknown>;
}

export interface ExecutionRun {
  runId:       string;
  chainName:   string;       // e.g. "triage_workflow", "chest_pain_crew"
  patientId?:  string;
  startedAt:   string;
  completedAt?:string;
  totalMs?:    number;
  status:      "running" | "success" | "partial_failure" | "failed";
  nodes:       NodeRecord[];
  tags:        string[];
  finalOutput?:unknown;
  parentRunId?:string;       // for sub-workflow runs
}

export interface RunComparison {
  runA:         ExecutionRun;
  runB:         ExecutionRun;
  nodeDeltas:   NodeDelta[];
  latencyDelta: number;      // ms difference (positive = runA slower)
  statusMatch:  boolean;
  outputMatch:  boolean;
}

export interface NodeDelta {
  nodeName:    string;
  latencyDelta:number;
  statusA:     NodeStatus;
  statusB:     NodeStatus;
  outputMatch: boolean;
}

// ── In-memory store (bounded ring buffer) ────────────────────────────────────

const MAX_RUNS    = 500;
const runStore    = new Map<string, ExecutionRun>();
const runOrder:   string[] = [];   // insertion order for LRU eviction

function addRun(run: ExecutionRun): void {
  if (runStore.size >= MAX_RUNS) {
    const oldest = runOrder.shift();
    if (oldest) runStore.delete(oldest);
  }
  runStore.set(run.runId, run);
  runOrder.push(run.runId);
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

/**
 * Start a new execution run. Returns the runId to pass to all node recording calls.
 */
export function startRun(
  chainName: string,
  tags:      string[] = [],
  patientId?:string,
  parentRunId?:string
): string {
  const runId = `run-${randomUUID().slice(0, 8)}`;
  const run: ExecutionRun = {
    runId,
    chainName,
    patientId,
    parentRunId,
    startedAt:   new Date().toISOString(),
    status:      "running",
    nodes:       [],
    tags,
  };
  addRun(run);
  return runId;
}

/** Record a node starting within a run. Returns a nodeId. */
export function startNode(
  runId:    string,
  nodeName: string,
  nodeType: string,
  input:    unknown,
  model?:   string,
  metadata?:Record<string, unknown>
): string {
  const run = runStore.get(runId);
  if (!run) return "";

  const nodeId = `node-${randomUUID().slice(0, 6)}`;
  const node: NodeRecord = {
    nodeId,
    nodeName,
    nodeType,
    status: "running",
    input,
    output: null,
    startedAt: new Date().toISOString(),
    model,
    metadata,
  };
  run.nodes.push(node);
  return nodeId;
}

/** Complete a node with its output. */
export function completeNode(
  runId:          string,
  nodeId:         string,
  output:         unknown,
  tokenEstimate?: number,
  evaluationScore?:number
): void {
  const run = runStore.get(runId);
  if (!run) return;

  const node = run.nodes.find((n) => n.nodeId === nodeId);
  if (!node) return;

  node.status          = "success";
  node.output          = output;
  node.completedAt     = new Date().toISOString();
  node.latencyMs       = Date.parse(node.completedAt) - Date.parse(node.startedAt);
  node.tokenEstimate   = tokenEstimate;
  node.evaluationScore = evaluationScore;
}

/** Fail a node. */
export function failNode(runId: string, nodeId: string, error: string): void {
  const run = runStore.get(runId);
  if (!run) return;

  const node = run.nodes.find((n) => n.nodeId === nodeId);
  if (!node) return;

  node.status      = "error";
  node.error       = error;
  node.completedAt = new Date().toISOString();
  node.latencyMs   = Date.parse(node.completedAt) - Date.parse(node.startedAt);
}

/** Skip a node (condition not met). */
export function skipNode(runId: string, nodeId: string, reason: string): void {
  const run = runStore.get(runId);
  if (!run) return;

  const node = run.nodes.find((n) => n.nodeId === nodeId);
  if (!node) return;

  node.status = "skipped";
  node.metadata = { ...(node.metadata ?? {}), skipReason: reason };
}

/** Complete a run. */
export function completeRun(runId: string, finalOutput?: unknown): void {
  const run = runStore.get(runId);
  if (!run) return;

  run.completedAt = new Date().toISOString();
  run.totalMs     = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  run.finalOutput = finalOutput;

  const hasError = run.nodes.some((n) => n.status === "error");
  const allOk    = run.nodes.every((n) => n.status === "success" || n.status === "skipped");
  run.status = allOk ? "success" : hasError ? "partial_failure" : "success";
}

/** Fail an entire run. */
export function failRun(runId: string, reason?: string): void {
  const run = runStore.get(runId);
  if (!run) return;

  run.status      = "failed";
  run.completedAt = new Date().toISOString();
  run.totalMs     = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  if (reason) run.tags.push(`fail:${reason.slice(0, 40)}`);
}

// ── Query API ─────────────────────────────────────────────────────────────────

/** Retrieve a full run by ID. */
export function getRun(runId: string): ExecutionRun | null {
  return runStore.get(runId) ?? null;
}

/** Get a specific node from a run. */
export function getNode(runId: string, nodeId: string): NodeRecord | null {
  const run = runStore.get(runId);
  if (!run) return null;
  return run.nodes.find((n) => n.nodeId === nodeId) ?? null;
}

/** List recent runs with optional filters. */
export function listRuns(opts: {
  chainName?:string;
  patientId?:string;
  status?:   ExecutionRun["status"];
  tag?:      string;
  limit?:    number;
} = {}): ExecutionRun[] {
  let runs = [...runStore.values()].reverse(); // most recent first

  if (opts.chainName) runs = runs.filter((r) => r.chainName === opts.chainName);
  if (opts.patientId) runs = runs.filter((r) => r.patientId === opts.patientId);
  if (opts.status)    runs = runs.filter((r) => r.status    === opts.status);
  if (opts.tag)       runs = runs.filter((r) => r.tags.includes(opts.tag!));

  return runs.slice(0, opts.limit ?? 50);
}

/**
 * Compare two runs side by side — the LangSmith "compare runs" feature.
 * Shows where one run was slower/different from another.
 */
export function compareRuns(runIdA: string, runIdB: string): RunComparison | null {
  const runA = runStore.get(runIdA);
  const runB = runStore.get(runIdB);
  if (!runA || !runB) return null;

  const nodeDeltas: NodeDelta[] = [];
  for (const nodeA of runA.nodes) {
    const nodeB = runB.nodes.find((n) => n.nodeName === nodeA.nodeName);
    if (!nodeB) continue;
    nodeDeltas.push({
      nodeName:     nodeA.nodeName,
      latencyDelta: (nodeA.latencyMs ?? 0) - (nodeB.latencyMs ?? 0),
      statusA:      nodeA.status,
      statusB:      nodeB.status,
      outputMatch:  JSON.stringify(nodeA.output) === JSON.stringify(nodeB.output),
    });
  }

  return {
    runA,
    runB,
    nodeDeltas,
    latencyDelta: (runA.totalMs ?? 0) - (runB.totalMs ?? 0),
    statusMatch:  runA.status === runB.status,
    outputMatch:  JSON.stringify(runA.finalOutput) === JSON.stringify(runB.finalOutput),
  };
}

/**
 * Replay descriptor — returns what inputs would need to be re-sent
 * to reproduce this run. (LangSmith "replay run" concept.)
 */
export function getReplayDescriptor(runId: string): {
  chainName:  string;
  firstInput: unknown;
  nodeInputs: Array<{ nodeName: string; input: unknown }>;
} | null {
  const run = runStore.get(runId);
  if (!run) return null;

  return {
    chainName:  run.chainName,
    firstInput: run.nodes[0]?.input ?? null,
    nodeInputs: run.nodes.map((n) => ({ nodeName: n.nodeName, input: n.input })),
  };
}

/** Execution summary for display. */
export function formatRunSummary(run: ExecutionRun): string {
  const nodes    = run.nodes.length;
  const success  = run.nodes.filter((n) => n.status === "success").length;
  const errors   = run.nodes.filter((n) => n.status === "error").length;
  const skipped  = run.nodes.filter((n) => n.status === "skipped").length;
  const avgMs    = nodes > 0
    ? Math.round(run.nodes.reduce((s, n) => s + (n.latencyMs ?? 0), 0) / nodes)
    : 0;

  const lines = [
    `## Run ${run.runId} — ${run.chainName} [${run.status.toUpperCase()}]`,
    `Patient: ${run.patientId ?? "—"} | Duration: ${run.totalMs ?? "?"}ms | Avg node: ${avgMs}ms`,
    `Nodes: ${success} OK, ${errors} ERR, ${skipped} SKIP of ${nodes}`,
    ``,
  ];

  for (const n of run.nodes) {
    const icon   = n.status === "success" ? "✓" : n.status === "error" ? "✗" : n.status === "skipped" ? "⤵" : "●";
    const score  = n.evaluationScore !== undefined ? ` [eval: ${(n.evaluationScore * 100).toFixed(0)}%]` : "";
    const tokens = n.tokenEstimate ? ` ~${n.tokenEstimate}tok` : "";
    const err    = n.error ? ` — ${n.error.slice(0, 60)}` : "";
    lines.push(`  ${icon} ${n.nodeName} (${n.nodeType}) ${n.latencyMs ?? 0}ms${tokens}${score}${err}`);
  }

  return lines.join("\n");
}
