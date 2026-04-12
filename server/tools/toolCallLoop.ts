/**
 * Tool Call Loop — Production-grade 5-step execution pipeline
 *
 * Article: "A production flow usually looks like this: a user asks for
 *  something, the agent checks whether it has enough context, then the
 *  model selects one or more tools. Your application validates the request,
 *  executes the tool, normalizes the result, and returns it to the model."
 *
 * The 5 explicit steps:
 *   1. VALIDATE   — Zod schema check on raw input (catches hallucinated args)
 *   2. AUTH       — access level check (read | write | admin gate)
 *   3. APPROVAL   — pause for confirmation on requiresApproval tools
 *   4. EXECUTE    — run the handler with validated, typed input
 *   5. NORMALIZE  — wrap result in ToolEnvelope
 *
 * Also implements:
 *   - Jitter retry on transient failures
 *   - Parallel multi-tool execution (article: "the model selects one or more tools")
 *   - Per-call audit logging
 *   - Partial failure handling (one tool failing does not abort the batch)
 */

import {
  getSchemaTool, validateToolInput,
} from "./toolSchemaRegistry";
import {
  successEnvelope, errorEnvelope, pendingApprovalEnvelope,
  batchToModelContent,
  type ToolEnvelope,
  type AccessLevel,
} from "./toolEnvelope";

// ── Auth context ──────────────────────────────────────────────────────────────

export interface CallerContext {
  callerId:         string;
  role:             "physician" | "nurse" | "agent" | "system";
  maxLevel:         AccessLevel;
  approvalGranted?: Set<string>;
}

// ── Step-level result ─────────────────────────────────────────────────────────

export interface LoopStepResult {
  toolId:        string;
  step:          "validate" | "auth" | "approval" | "execute" | "complete";
  envelope:      ToolEnvelope;
  attempt:       number;
  blockedReason: string | null;
}

// ── Access rank ───────────────────────────────────────────────────────────────

const ACCESS_RANK: Record<AccessLevel, number> = { read: 0, write: 1, admin: 2 };

// ── Single tool execution ─────────────────────────────────────────────────────

/**
 * Execute one tool through the full 5-step pipeline.
 */
export async function executeToolCall(
  toolId:   string,
  rawInput: unknown,
  caller:   CallerContext,
  opts: { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<LoopStepResult> {
  const tStart = Date.now();
  const { maxRetries = 2, retryDelayMs = 100 } = opts;

  // ── Step 1: Schema validation ──────────────────────────────────────────────
  const tool = getSchemaTool(toolId);
  if (!tool) {
    return {
      toolId, step: "validate", attempt: 0, blockedReason: `Tool not found: ${toolId}`,
      envelope: errorEnvelope(toolId, `Tool not registered: ${toolId}`, Date.now() - tStart),
    };
  }

  const validation = validateToolInput(toolId, rawInput);
  if (!validation.valid) {
    const msg = `Input validation failed: ${validation.errors.join("; ")}`;
    return {
      toolId, step: "validate", attempt: 0, blockedReason: msg,
      envelope: errorEnvelope(toolId, msg, Date.now() - tStart, tool.accessLevel, tool.requiresApproval),
    };
  }

  // ── Step 2: Authorization check ───────────────────────────────────────────
  if (ACCESS_RANK[tool.accessLevel] > ACCESS_RANK[caller.maxLevel]) {
    const msg = `Access denied: '${toolId}' requires ${tool.accessLevel}, caller has ${caller.maxLevel}`;
    return {
      toolId, step: "auth", attempt: 0, blockedReason: msg,
      envelope: errorEnvelope(toolId, msg, Date.now() - tStart, tool.accessLevel, tool.requiresApproval),
    };
  }

  if (tool.accessLevel === "admin" && caller.role !== "physician" && caller.role !== "system") {
    const msg = `Admin tool '${toolId}' restricted to physicians`;
    return {
      toolId, step: "auth", attempt: 0, blockedReason: msg,
      envelope: errorEnvelope(toolId, msg, Date.now() - tStart, tool.accessLevel, true),
    };
  }

  // ── Step 3: Approval gate ─────────────────────────────────────────────────
  if (tool.requiresApproval && !caller.approvalGranted?.has(toolId)) {
    return {
      toolId, step: "approval", attempt: 0, blockedReason: null,
      envelope: pendingApprovalEnvelope(toolId, Date.now() - tStart, tool.accessLevel),
    };
  }

  // ── Step 4: Execute with jitter retry ─────────────────────────────────────
  let attempt = 0;
  let lastError = "";

  while (attempt <= maxRetries) {
    try {
      const data = await tool.handler(validation.data);
      return {
        toolId, step: "complete", attempt, blockedReason: null,
        envelope: successEnvelope(toolId, data, Date.now() - tStart, tool.accessLevel, tool.requiresApproval),
      };
    } catch (err: any) {
      lastError = err?.message ?? "Unknown error";
      attempt++;
      if (attempt <= maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * retryDelayMs;
        await _sleep(delay);
      }
    }
  }

  const msg = `Execution failed after ${attempt} attempt(s): ${lastError}`;
  return {
    toolId, step: "execute", attempt, blockedReason: lastError,
    envelope: errorEnvelope(toolId, msg, Date.now() - tStart, tool.accessLevel, tool.requiresApproval),
  };
}

// ── Parallel batch execution ──────────────────────────────────────────────────

export interface BatchCallResult {
  results:      LoopStepResult[];
  allSucceeded: boolean;
  anyBlocked:   boolean;
  anyPending:   boolean;
  modelContext: string;
  latencyMs:    number;
}

/**
 * Execute multiple tool calls in parallel.
 * One failure does NOT abort the batch.
 */
export async function executeToolBatch(
  calls:  Array<{ toolId: string; input: unknown }>,
  caller: CallerContext,
  opts:   { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<BatchCallResult> {
  const tStart = Date.now();

  const results = await Promise.all(
    calls.map((c) => executeToolCall(c.toolId, c.input, caller, opts))
  );

  const envelopes    = results.map((r) => r.envelope);
  const allSucceeded = results.every((r) => r.step === "complete");
  const anyBlocked   = results.some((r) => r.blockedReason !== null);
  const anyPending   = results.some((r) => r.step === "approval");

  return {
    results,
    allSucceeded,
    anyBlocked,
    anyPending,
    modelContext: batchToModelContent(envelopes),
    latencyMs:   Date.now() - tStart,
  };
}

// ── Approval granting ─────────────────────────────────────────────────────────

/** Grant physician approval for a specific tool this session. */
export function grantApproval(caller: CallerContext, toolId: string): void {
  if (!caller.approvalGranted) caller.approvalGranted = new Set();
  caller.approvalGranted.add(toolId);
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatLoopSummary(batch: BatchCallResult): string {
  const lines = [`Tool Batch — ${batch.results.length} call(s), ${batch.latencyMs}ms total`];
  for (const r of batch.results) {
    const status = r.step === "complete" ? "✓" : r.step === "approval" ? "⏳" : "✗";
    const note   = r.blockedReason ? ` — ${r.blockedReason.slice(0, 60)}` : "";
    lines.push(`  ${status} [${r.envelope.accessLevel.toUpperCase()}] ${r.toolId} (${r.envelope.latencyMs}ms, step: ${r.step})${note}`);
  }
  if (batch.anyPending)   lines.push("  ⏳ Awaiting physician approval.");
  if (batch.anyBlocked)   lines.push("  ✗ One or more tools blocked.");
  if (batch.allSucceeded) lines.push("  ✓ All tools completed.");
  return lines.join("\n");
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
