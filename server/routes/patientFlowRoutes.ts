/**
 * server/routes/patientFlowRoutes.ts — Patient flow session endpoints
 *
 * FIXES (Code Review Issue #8):
 *   All session endpoints were missing authentication middleware — any client
 *   could create sessions, confirm consent, read any session, or run the full
 *   patient flow pipeline without identity. Fixed: requirePhysician middleware
 *   applied globally. Clinical session ownership is validated against the
 *   physician's clinicId to prevent cross-tenant session reads.
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { startSession, confirmConsent, getSession, listActiveSessions } from "../patient/sessionController";
import { checkScope } from "../patient/scopeGuard";
import { checkEscalation } from "../patient/escalation";
import { runPatientFlow } from "../patient/patientFlow";

const router = express.Router();

// Require physician-level auth on all patient flow endpoints (Issue #8)
router.use(requirePhysician);

/**
 * POST /api/patient-flow/start
 * Start a new patient session. clinicId injected from verified token.
 */
router.post("/start", (req, res) => {
  try {
    const physician = req.physician!;
    const session   = startSession({
      ...req.body,
      clinicId:    physician.clinicId,
      initiatedBy: physician.id,
    });
    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/patient-flow/consent
 * Confirm patient consent for an active session.
 * Validates that the session belongs to the authenticated physician's clinic.
 */
router.post("/consent", (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ ok: false, error: "sessionId required" });

    const session = confirmConsent(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });

    // Tenant isolation: ensure session belongs to the authenticated clinic
    const physician = req.physician!;
    if (physician.clinicId && session.clinicId && session.clinicId !== physician.clinicId) {
      return res.status(403).json({ ok: false, error: "Cross-tenant session access denied" });
    }

    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/patient-flow/session/:sessionId
 * Retrieve a session by ID — scoped to the authenticated physician's clinic.
 */
router.get("/session/:sessionId", (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });

    const physician = req.physician!;
    if (physician.clinicId && session.clinicId && session.clinicId !== physician.clinicId) {
      return res.status(403).json({ ok: false, error: "Cross-tenant session access denied" });
    }

    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/patient-flow/sessions
 * List active sessions for the authenticated physician's clinic.
 */
router.get("/sessions", (req, res) => {
  try {
    const physician = req.physician!;
    const allSessions = listActiveSessions();
    // Filter to only sessions belonging to the authenticated clinic
    const sessions = physician.clinicId
      ? allSessions.filter((s: any) => !s.clinicId || s.clinicId === physician.clinicId)
      : allSessions;
    res.json({ ok: true, sessions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/patient-flow/scope-check
 */
router.post("/scope-check", (req, res) => {
  try {
    const result = checkScope(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/patient-flow/flow
 * Run the full patient flow pipeline.
 * clinicId injected from token to scope clinical decisions.
 */
router.post("/flow", async (req, res) => {
  try {
    const physician = req.physician!;
    const result    = await runPatientFlow({
      ...req.body,
      clinicId:    physician.clinicId,
      physicianId: physician.id,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
