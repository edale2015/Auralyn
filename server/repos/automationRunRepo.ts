import { query } from "../db";

export async function createAutomationRun(input: {
  clinicId?: string;
  templateKey: string;
  status: string;
  traceId?: string;
  startedBy?: string;
  payload?: unknown;
}) {
  const result = await query(
    `INSERT INTO automation_runs (clinic_id, template_key, status, trace_id, started_by, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.clinicId ?? null,
      input.templateKey,
      input.status,
      input.traceId ?? null,
      input.startedBy ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    ]
  );
  return result.rows[0];
}

export async function updateAutomationRun(input: {
  runId: string;
  status?: string;
  currentStep?: number;
  result?: unknown;
  error?: string | null;
  finished?: boolean;
}) {
  const result = await query(
    `UPDATE automation_runs
     SET
       status = COALESCE($2, status),
       current_step = COALESCE($3, current_step),
       result = COALESCE($4, result),
       error = COALESCE($5, error),
       finished_at = CASE WHEN $6 THEN NOW() ELSE finished_at END
     WHERE id = $1
     RETURNING *`,
    [
      input.runId,
      input.status ?? null,
      input.currentStep ?? null,
      input.result ? JSON.stringify(input.result) : null,
      input.error ?? null,
      input.finished ?? false,
    ]
  );
  return result.rows[0];
}

export async function getAutomationRun(runId: string) {
  const result = await query(`SELECT * FROM automation_runs WHERE id = $1`, [runId]);
  return result.rows[0] ?? null;
}

export async function listAutomationRuns(limit = 100) {
  const result = await query(
    `SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function createAutomationRunEvent(input: {
  runId: string;
  eventType: string;
  stepIndex?: number;
  actionName?: string;
  payload?: unknown;
  screenshotKey?: string;
}) {
  const result = await query(
    `INSERT INTO automation_run_events (run_id, event_type, step_index, action_name, payload, screenshot_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.runId,
      input.eventType,
      input.stepIndex ?? null,
      input.actionName ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      input.screenshotKey ?? null,
    ]
  );
  return result.rows[0];
}

export async function listAutomationRunEvents(runId: string) {
  const result = await query(
    `SELECT * FROM automation_run_events WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );
  return result.rows;
}

export async function createAutomationApproval(input: {
  runId: string;
  checkpointName: string;
  requestedBy?: string;
}) {
  const result = await query(
    `INSERT INTO automation_approvals (run_id, checkpoint_name, requested_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.runId, input.checkpointName, input.requestedBy ?? null]
  );
  return result.rows[0];
}

export async function getPendingApprovalByRunAndCheckpoint(
  runId: string,
  checkpointName: string
) {
  const result = await query(
    `SELECT * FROM automation_approvals
     WHERE run_id = $1 AND checkpoint_name = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [runId, checkpointName]
  );
  return result.rows[0] ?? null;
}

export async function decideAutomationApproval(input: {
  approvalId: string;
  status: "approved" | "rejected";
  decidedBy?: string;
  decisionNotes?: string;
}) {
  const result = await query(
    `UPDATE automation_approvals
     SET status = $2,
         decided_by = $3,
         decision_notes = $4,
         decided_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.approvalId, input.status, input.decidedBy ?? null, input.decisionNotes ?? null]
  );
  return result.rows[0] ?? null;
}

export async function listPendingApprovals(limit = 100) {
  const result = await query(
    `SELECT * FROM automation_approvals
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
