/**
 * executeWithScope — global action wrapper
 * Every significant agent action flows through this to enforce scope contracts.
 * Returns PENDING_OVERRIDE for physician-gated actions instead of throwing.
 */

import { guardAction, type GuardResult } from "./actionGuard";
import type { ActionRequest }             from "../scope/agentScopeEngine";

export interface ScopedExecutionResult<T = any> {
  status:    "APPROVED" | "BLOCKED" | "PENDING_OVERRIDE";
  result?:   T;
  guard:     GuardResult;
  durationMs:number;
}

export async function executeWithScope<T = any>(
  request: ActionRequest,
  handler: () => Promise<T>
): Promise<ScopedExecutionResult<T>> {
  const t0    = Date.now();
  const guard = await guardAction(request);

  if (guard.status === "PENDING_OVERRIDE") {
    return { status: "PENDING_OVERRIDE", guard, durationMs: Date.now() - t0 };
  }

  if (!guard.allowed) {
    return { status: "BLOCKED", guard, durationMs: Date.now() - t0 };
  }

  const result = await handler();
  return { status: "APPROVED", result, guard, durationMs: Date.now() - t0 };
}

// Strict mode: throws on block/override instead of returning status object
export async function executeStrict<T = any>(request: ActionRequest, handler: () => Promise<T>): Promise<T> {
  const r = await executeWithScope(request, handler);
  if (r.status === "BLOCKED")          throw new Error(`🚫 Scope blocked: ${r.guard.reason}`);
  if (r.status === "PENDING_OVERRIDE") throw new Error(`⚠️ Physician override required: ${r.guard.reason}`);
  return r.result as T;
}
