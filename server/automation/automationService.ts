import { startAutomationSession, stopAutomationSession } from "./browser";
import { getAutomationTemplate, listAutomationTemplates } from "./templateRegistry";
import { interpretPage } from "./pageInterpreter";
import { runAutomationAction } from "./actionRunner";
import {
  createAutomationRun,
  updateAutomationRun,
  listAutomationRuns,
  getAutomationRun,
  listAutomationRunEvents,
  decideAutomationApproval,
  listPendingApprovals,
} from "../repos/automationRunRepo";
import type { AutomationRunInput } from "./types";

export async function runAutomation(input: AutomationRunInput) {
  const template = getAutomationTemplate(input.templateKey);

  const run = await createAutomationRun({
    clinicId: input.clinicId,
    templateKey: input.templateKey,
    status: "running",
    traceId: input.traceId,
    startedBy: input.startedBy,
    payload: input.payload,
  });

  const session = await startAutomationSession(true);

  try {
    await session.page.goto(template.startUrl, { waitUntil: "networkidle" });

    const pageSummary = await interpretPage(session.page);

    await updateAutomationRun({
      runId: run.id,
      currentStep: 0,
      result: { pageSummary },
    });

    for (let i = 0; i < template.actions.length; i++) {
      const action = template.actions[i];

      await updateAutomationRun({ runId: run.id, currentStep: i });

      await runAutomationAction({
        runId: run.id,
        stepIndex: i,
        action,
        payload: input.payload,
        page: session.page,
        startedBy: input.startedBy,
      });
    }

    const finalPage = await interpretPage(session.page);

    const updated = await updateAutomationRun({
      runId: run.id,
      status: "completed",
      result: { finalPage },
      finished: true,
    });

    return updated;
  } catch (err: any) {
    await updateAutomationRun({
      runId: run.id,
      status: "failed",
      error: err?.message || "Unknown automation failure",
      finished: true,
    });

    throw err;
  } finally {
    await stopAutomationSession(session);
  }
}

export async function getAutomationRunDetail(runId: string) {
  const [run, events] = await Promise.all([
    getAutomationRun(runId),
    listAutomationRunEvents(runId),
  ]);
  return { run, events };
}

export async function listRuns() {
  return listAutomationRuns(100);
}

export async function listApprovals() {
  return listPendingApprovals(100);
}

export async function approveRunCheckpoint(
  approvalId: string,
  decidedBy?: string,
  notes?: string
) {
  return decideAutomationApproval({ approvalId, status: "approved", decidedBy, decisionNotes: notes });
}

export async function rejectRunCheckpoint(
  approvalId: string,
  decidedBy?: string,
  notes?: string
) {
  return decideAutomationApproval({ approvalId, status: "rejected", decidedBy, decisionNotes: notes });
}

export { listAutomationTemplates };
