import { db } from "../db";
import { sql } from "drizzle-orm";

export async function logApproval({
  patientId,
  physicianId,
  action,
  overrideData,
}: {
  patientId: string;
  physicianId: string;
  action: "approve" | "override" | "escalate";
  overrideData?: any;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_logs (trace_id, step, input, output, metadata)
      VALUES (
        ${patientId},
        ${"PHYSICIAN_ACTION"},
        ${JSON.stringify({ action })}::jsonb,
        ${JSON.stringify(overrideData ?? null)}::jsonb,
        ${JSON.stringify({ physicianId, timestamp: new Date().toISOString() })}::jsonb
      )
    `);

    console.log(JSON.stringify({
      event: "physician_action",
      patientId,
      physicianId,
      action,
      timestamp: new Date().toISOString(),
    }));
  } catch (e: any) {
    console.error("[ApprovalAudit] Failed to log physician action:", e?.message);
  }
}
