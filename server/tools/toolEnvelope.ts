/**
 * Tool Result Envelope — Normalized, typed response shape for every tool call
 *
 * Article: "execute the tool, normalize the result, and return it to the model."
 *  "The model reasons, tools execute actions, plugins package capabilities,
 *   hooks enforce lifecycle behavior."
 *
 * The existing executeTool returns Promise<unknown> — untyped, unnormalized.
 * Every tool result that flows back to the agent or the model should be a
 * consistent envelope:
 *   { ok, tool, data, error, latencyMs, traceId, accessLevel, approvalRequired }
 *
 * Benefits:
 *   1. The agent always knows how to inspect success vs. failure.
 *   2. The model receives consistent structure for its reasoning.
 *   3. Partial failures are explicit (not thrown exceptions).
 *   4. Audit trail is attached to every result at the envelope layer.
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccessLevel = "read" | "write" | "admin";

export interface ToolEnvelope<T = unknown> {
  ok:              boolean;
  tool:            string;        // tool id
  data:            T | null;      // result payload on success, null on failure
  error:           string | null; // error message on failure, null on success
  latencyMs:       number;
  traceId:         string;        // unique ID for this tool call (audit)
  accessLevel:     AccessLevel;
  approvalRequired:boolean;       // true if the action needs physician sign-off
  timestamp:       string;
  meta?:           Record<string, unknown>;   // optional extra info (retry count, etc.)
}

// ── Factory functions ─────────────────────────────────────────────────────────

export function successEnvelope<T>(
  toolId:          string,
  data:            T,
  latencyMs:       number,
  accessLevel:     AccessLevel  = "read",
  approvalRequired:boolean       = false,
  meta?:           Record<string, unknown>
): ToolEnvelope<T> {
  return {
    ok:              true,
    tool:            toolId,
    data,
    error:           null,
    latencyMs,
    traceId:         randomUUID().slice(0, 12),
    accessLevel,
    approvalRequired,
    timestamp:       new Date().toISOString(),
    meta,
  };
}

export function errorEnvelope(
  toolId:          string,
  error:           string,
  latencyMs:       number,
  accessLevel:     AccessLevel  = "read",
  approvalRequired:boolean       = false,
  meta?:           Record<string, unknown>
): ToolEnvelope<null> {
  return {
    ok:              false,
    tool:            toolId,
    data:            null,
    error,
    latencyMs,
    traceId:         randomUUID().slice(0, 12),
    accessLevel,
    approvalRequired,
    timestamp:       new Date().toISOString(),
    meta,
  };
}

export function pendingApprovalEnvelope(
  toolId:      string,
  latencyMs:   number,
  accessLevel: AccessLevel = "write"
): ToolEnvelope<{ status: "pending_approval"; message: string }> {
  return {
    ok:              true,
    tool:            toolId,
    data:            { status: "pending_approval", message: `Tool '${toolId}' requires explicit physician approval before execution.` },
    error:           null,
    latencyMs,
    traceId:         randomUUID().slice(0, 12),
    accessLevel,
    approvalRequired:true,
    timestamp:       new Date().toISOString(),
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Convert an envelope to a model-readable string for injection into context.
 * The article: "The model then composes a final answer, or it may call more tools."
 * This is what gets placed into the `tool_results` message.
 */
export function envelopeToModelContext(env: ToolEnvelope): string {
  if (!env.ok) {
    return `[TOOL ERROR] ${env.tool} failed: ${env.error} (trace: ${env.traceId})`;
  }
  if (env.data && typeof env.data === "object" && "status" in (env.data as any)) {
    const d = env.data as any;
    if (d.status === "pending_approval") {
      return `[TOOL PENDING] ${env.tool}: ${d.message}`;
    }
  }
  return `[TOOL OK] ${env.tool} (${env.latencyMs}ms, ${env.accessLevel}): ${JSON.stringify(env.data)}`;
}

/**
 * Serialize a batch of envelopes from a multi-tool agent step
 * into the standard tool_results message content format.
 */
export function batchToModelContent(envelopes: ToolEnvelope[]): string {
  return envelopes.map(envelopeToModelContext).join("\n\n");
}

// ── Audit export ──────────────────────────────────────────────────────────────

/** Strip data payload for audit logging (keep metadata, remove PHI in production) */
export function auditableEnvelope(env: ToolEnvelope): Omit<ToolEnvelope, "data"> & { hasData: boolean } {
  const { data, ...rest } = env;
  return { ...rest, hasData: data !== null };
}
