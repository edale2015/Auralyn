import {
  createAutomationApproval,
  getPendingApprovalByRunAndCheckpoint,
} from "../repos/automationRunRepo";

export async function requestApproval(
  runId: string,
  checkpointName: string,
  requestedBy?: string
) {
  const existing = await getPendingApprovalByRunAndCheckpoint(runId, checkpointName);
  if (existing) return existing;

  return createAutomationApproval({ runId, checkpointName, requestedBy });
}

export async function waitForApproval(
  runId: string,
  checkpointName: string,
  timeoutMs = 15 * 60 * 1000
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const pending = await getPendingApprovalByRunAndCheckpoint(runId, checkpointName);

    if (!pending) {
      return { approved: false, reason: "Approval record not found" };
    }

    if (pending.status === "approved") {
      return { approved: true };
    }

    if (pending.status === "rejected") {
      return { approved: false, reason: pending.decision_notes || "Rejected" };
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return { approved: false, reason: "Approval timeout" };
}
