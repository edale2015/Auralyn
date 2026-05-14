import { Router } from "express";
import { signoffService } from "../services/signoffService";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger";

export const signoffRouter = Router();

const VALID_STATUSES = ["APPROVED", "APPROVED_WITH_EDITS", "REQUEST_MORE_INFO", "ESCALATED", "REJECTED"] as const;

signoffRouter.post("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId, reviewerId, status, finalDisposition } = req.body ?? {};

    if (!caseId || typeof caseId !== "string") {
      return res.status(400).json({ error: "missing or invalid caseId" });
    }
    if (!reviewerId || typeof reviewerId !== "string") {
      return res.status(400).json({ error: "missing or invalid reviewerId" });
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status, must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const signoff = await signoffService.signoff(req.body);

    // Task 8: Send share-token SMS to patient at discharge (APPROVED / APPROVED_WITH_EDITS)
    if (status === "APPROVED" || status === "APPROVED_WITH_EDITS") {
      try {
        const summaryRow = await db.execute(sql`
          SELECT ps.share_token, e.patient_phone
          FROM patient_summaries ps
          LEFT JOIN encounters e ON e.id::text = ps.encounter_id::text
          WHERE ps.encounter_id::text = ${caseId}
          LIMIT 1
        `).then(r => r.rows[0] as { share_token?: string; patient_phone?: string } | undefined);

        if (summaryRow?.share_token && summaryRow?.patient_phone) {
          const { default: twilio } = await import("twilio");
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          const visitUrl = `${process.env.APP_BASE_URL ?? "https://auralyn.app"}/care/${summaryRow.share_token}`;
          await client.messages.create({
            body: `Your visit summary is ready. View it and send us updates on how you're feeling: ${visitUrl}`,
            from: process.env.TWILIO_FROM_NUMBER ?? "",
            to:   summaryRow.patient_phone,
          });
          logger.info("[Signoff] Discharge SMS sent", { caseId, shareToken: summaryRow.share_token });
        }
      } catch (smsErr: any) {
        logger.warn("[Signoff] Discharge SMS failed (non-blocking)", { error: smsErr?.message });
      }
    }

    res.json(signoff);
  } catch (e: any) {
    console.error("[Signoff] error:", e);
    const code = e.message?.includes("not found") ? 404 : 500;
    res.status(code).json({ error: e.message });
  }
});
