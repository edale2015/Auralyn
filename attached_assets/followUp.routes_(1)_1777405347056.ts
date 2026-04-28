// ─────────────────────────────────────────────────────────────────────────────
// FILE 1 OF 2: server/routes/followUp.routes.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * followUp.routes.ts
 * Drop into: server/routes/followUp.routes.ts
 *
 * REST API for the follow-up subsystem.
 * Register in server/index.ts:
 *   import { followUpRouter } from "./routes/followUp.routes";
 *   app.use(followUpRouter);
 *
 * Also wire the inbound WhatsApp webhook to processPatientResponse():
 *   In your existing Twilio webhook handler (server/routes/whatsapp.routes.ts or similar),
 *   after receiving an inbound message, call:
 *     await processPatientResponse(inboundFrom, inboundBody);
 *   The function is a no-op if the sender has no active enrollment.
 */

import { Router }            from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import {
  enrollInFollowUp,
  getEnrollmentsByPhysician,
  processPatientResponse,
} from "../followup/followUpService";

export const followUpRouter = Router();

// ── POST /api/followup/enroll ─────────────────────────────────────────────────
// Called at case discharge when complaint matches a chronic protocol.
// Triggered from the discharge action in review.routes.ts (see patch below).

followUpRouter.post(
  "/api/followup/enroll",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId, complaintSlug, patientPhone, patientName, physicianId } = req.body;

      if (!caseId || !complaintSlug || !patientPhone) {
        return res.status(400).json({
          ok: false,
          error: "caseId, complaintSlug, and patientPhone are required",
        });
      }

      const result = await enrollInFollowUp({
        caseId,
        complaintSlug,
        patientPhone,
        patientName,
        physicianId: physicianId ?? req.user?.id,
      });

      return res.json({ ok: true, ...result });

    } catch (e: any) {
      console.error("[FollowUp] Enroll failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/followup/enrollments ────────────────────────────────────────────
// Returns all enrollments for the logged-in physician with latest response.
// Powers the FollowUpMonitoringDashboard.

followUpRouter.get(
  "/api/followup/enrollments",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = req.user?.id ?? "phys1";
      const enrollments = await getEnrollmentsByPhysician(physicianId);
      return res.json({ ok: true, enrollments });
    } catch (e: any) {
      console.error("[FollowUp] Enrollments fetch failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── POST /api/followup/webhook/response ──────────────────────────────────────
// TEST endpoint — simulates an inbound patient WhatsApp response.
// In production, patient responses come through the Twilio webhook.
// Wire the Twilio webhook to call processPatientResponse() directly.

followUpRouter.post(
  "/api/followup/webhook/response",
  requireReviewAuth,  // admin/dev only in test mode
  async (req, res) => {
    try {
      const { patientPhone, responseText } = req.body;
      if (!patientPhone || !responseText) {
        return res.status(400).json({ ok: false, error: "patientPhone and responseText required" });
      }
      const result = await processPatientResponse(patientPhone, responseText);
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// PATCH: review.routes.ts — auto-enroll at case discharge
// Add this block inside POST /api/review/case/:caseId handler,
// AFTER the existing discharge WhatsApp send block (Win 1),
// BEFORE res.json():
// ─────────────────────────────────────────────────────────────────────────────

/*
// ── Auto-enroll in follow-up if complaint has a protocol ─────────────────────
// Fire-and-forget — enrollment failure never blocks the physician review action
if (status === "APPROVED" || status === "SIGNED_OFF") {
  const followUpDoc = doc ?? await getCase(caseId);
  const phone       = followUpDoc?.source?.threadId;
  const slug        = followUpDoc?.complaint?.slug ?? followUpDoc?.complaint;
  const isWhatsApp  = followUpDoc?.source?.channel === "whatsapp";

  if (isWhatsApp && phone && slug) {
    enrollInFollowUp({
      caseId,
      complaintSlug:  slug,
      patientPhone:   phone,
      patientName:    followUpDoc?.answers?.structured?.name ?? "Patient",
      physicianId:    reviewer?.id ?? req.user?.id,
    }).catch((err: Error) =>
      console.error("[Review] Follow-up enrollment failed", { caseId, err: err.message })
    );
  }
}
*/

// Add this import at the top of review.routes.ts:
// import { enrollInFollowUp } from "../followup/followUpService";
