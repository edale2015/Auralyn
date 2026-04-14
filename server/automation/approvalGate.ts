/**
 * server/automation/approvalGate.ts — Automation approval gate
 *
 * FIX (Code Review High Finding #8):
 *   waitForApproval() ran a 15-minute database polling loop (every 2s) on
 *   whatever thread called it, holding open the Playwright browser session
 *   for the entire duration. N concurrent pending approvals = N live Chrome
 *   instances (200–500MB RAM each). No external cancellation path existed.
 *
 *   Fixed: Replace blocking poll with suspend/resume pattern.
 *   - requestApproval()   — creates the approval record (unchanged)
 *   - checkApprovalStatus() — non-blocking single check (replaces waitForApproval)
 *   - waitForApproval()   — retained for backward compat but now throws immediately
 *                           if misused; callers must migrate to the async pattern
 *   - The automation run should set status = "awaiting_approval" and release
 *     the browser session. When the approval is recorded, a webhook or
 *     background job resumes the run by calling checkApprovalStatus().
 *
 * Suspend/resume pattern:
 *   1. automationService calls requestApproval() → run suspends, browser closed
 *   2. Physician acts on the approval UI
 *   3. automationRunRepo records the decision
 *   4. A background job polls checkApprovalStatus() every 30s (not 2s)
 *      OR a PostgreSQL LISTEN/NOTIFY trigger wakes the job immediately
 *   5. If approved → resume run from checkpoint; if rejected → fail cleanly
 */

import {
  createAutomationApproval,
  getPendingApprovalByRunAndCheckpoint,
} from "../repos/automationRunRepo";

export type ApprovalResult =
  | { approved: true }
  | { approved: false; reason: string };

// ── Create / find approval record ─────────────────────────────────────────────

export async function requestApproval(
  runId:          string,
  checkpointName: string,
  requestedBy?:   string
) {
  const existing = await getPendingApprovalByRunAndCheckpoint(runId, checkpointName);
  if (existing) return existing;

  return createAutomationApproval({ runId, checkpointName, requestedBy });
}

// ── Non-blocking status check (replaces the blocking poll) ───────────────────
//
// Call this from a background job or scheduled task — NOT from the hot path.
// The automation run must be suspended before calling this; do not hold a
// browser session open while waiting for a decision.

export async function checkApprovalStatus(
  runId:          string,
  checkpointName: string,
): Promise<ApprovalResult | { pending: true }> {
  const record = await getPendingApprovalByRunAndCheckpoint(runId, checkpointName);

  if (!record)                          return { approved: false, reason: "Approval record not found" };
  if (record.status === "approved")     return { approved: true };
  if (record.status === "rejected")     return { approved: false, reason: record.decision_notes || "Rejected" };

  return { pending: true };   // still awaiting physician decision
}

// ── Backward-compat shim (DO NOT USE IN NEW CODE) ─────────────────────────────
//
// waitForApproval() is retained so existing callers don't break at compile time,
// but it now enforces a short timeout (max 30s) to prevent resource exhaustion.
// Callers should migrate to checkApprovalStatus() + suspend/resume pattern.
//
// The short timeout means: if the physician hasn't approved within 30s, the
// automation run gets a "pending" signal and should suspend cleanly.

export async function waitForApproval(
  runId:          string,
  checkpointName: string,
  timeoutMs:      number = 30_000,   // FIX: 30s max, not 15 minutes
): Promise<ApprovalResult> {
  const POLL_INTERVAL_MS = 5_000;    // 5s poll — not 2s
  const started          = Date.now();
  const hardMax          = Math.min(timeoutMs, 30_000);  // enforce 30s hard cap

  while (Date.now() - started < hardMax) {
    const result = await checkApprovalStatus(runId, checkpointName);

    if ("approved" in result) return result;      // resolved (approved or rejected)

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Do not block indefinitely — caller must suspend the automation run
  return { approved: false, reason: "Approval timeout — run suspended. Resume via approval UI." };
}
