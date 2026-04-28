/**
 * followUp.routes.ts
 *
 * REST API for the follow-up subsystem.
 * Registered in server/index.ts via: app.use(followUpRouter)
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
        physicianId: physicianId ?? (req as any).user?.id,
      });

      return res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error("[FollowUp] Enroll failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message });
    }
  }
);

// ── GET /api/followup/enrollments ────────────────────────────────────────────

followUpRouter.get(
  "/api/followup/enrollments",
  requireReviewAuth,
  async (req, res) => {
    try {
      const physicianId = (req as any).user?.id ?? "phys1";
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

followUpRouter.post(
  "/api/followup/webhook/response",
  requireReviewAuth,
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
