/**
 * server/routes/rlhfRoutes.ts — RLHF control plane routes
 *
 * FIXES (Code Review Issues #3, #4):
 *   Issue #3: All endpoints now require physician-level authentication via
 *     requirePhysician middleware. Previously had zero auth on every route —
 *     any network client could read/write feedback and change proposal status.
 *   Issue #4: "applied" status is no longer caller-settable. The review endpoint
 *     only accepts "approved" | "rejected". A separate privileged /apply endpoint
 *     requires admin role AND captures the reviewer identity from the JWT payload
 *     (not from the request body) to prevent self-attestation fraud.
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { rbacService } from "../auth/rbacService";
import { rlhfService } from "../services/rlhfService";

const router = express.Router();

// All RLHF routes require physician-level auth (Issue #3)
router.use(requirePhysician);

/**
 * GET /api/rlhf/feedback
 * List all physician feedback events — scoped to the authenticated physician's clinic.
 */
router.get("/feedback", (req, res) => {
  const clinicId = req.physician!.clinicId;
  res.json(rlhfService.listFeedback(clinicId));
});

/**
 * POST /api/rlhf/feedback
 * Submit a new physician feedback event.
 * Reviewer identity injected from JWT — not accepted from request body.
 */
router.post("/feedback", (req, res) => {
  try {
    const physician = req.physician!;
    const saved = rlhfService.addFeedback({
      ...req.body,
      // Stamp identity from the verified token — never from caller body
      physicianId: physician.id,
      clinicId:    physician.clinicId,
    });
    res.json(saved);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not save feedback",
    });
  }
});

/**
 * GET /api/rlhf/proposals
 * List all RLHF improvement proposals for the authenticated clinic.
 */
router.get("/proposals", (req, res) => {
  const clinicId = req.physician!.clinicId;
  res.json(rlhfService.listProposals(clinicId));
});

/**
 * POST /api/rlhf/proposals/generate
 * Generate improvement proposals from accumulated feedback.
 * Requires physician+ access.
 */
router.post("/proposals/generate", (req, res) => {
  const clinicId = req.physician!.clinicId;
  const proposals = rlhfService.generateProposals(clinicId);
  res.json({ created: proposals.length, proposals });
});

/**
 * POST /api/rlhf/proposals/:id/review
 * Physician approves or rejects a proposal.
 *
 * FIXED (Issue #4): "applied" is removed from the accepted status values.
 * Approval/rejection is the physician's action. Actual application is a separate
 * admin-gated step (/apply below) that requires explicit admin role + audit stamp.
 */
router.post("/proposals/:id/review", (req, res) => {
  try {
    const { status } = req.body;

    // "applied" intentionally excluded — use /apply endpoint (admin-only)
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      return;
    }

    const physician = req.physician!;
    const proposal  = rlhfService.reviewProposal(req.params.id, status, {
      reviewerId:   physician.id,
      reviewerRole: physician.role,
      clinicId:     physician.clinicId,
      reviewedAt:   new Date().toISOString(),
    });

    res.json(proposal);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Review failed",
    });
  }
});

/**
 * POST /api/rlhf/proposals/:id/apply
 * Admin-only: mark a previously-approved proposal as applied.
 * Captures immutable reviewer identity from the token — not from the body.
 *
 * FIXED (Issue #4): "applied" transition is now:
 *   1. Admin-role gated (not just physician)
 *   2. Identity comes from verified token, not caller body
 *   3. Can only be called on proposals already in "approved" state
 */
router.post("/proposals/:id/apply", (req, res) => {
  const physician = req.physician!;

  // Require admin role for the apply action
  if (!rbacService.can(physician.role as any, "tenant:manage")) {
    res.status(403).json({ error: "Admin role required to apply proposals" });
    return;
  }

  try {
    const proposal = rlhfService.applyProposal(req.params.id, {
      appliedById:   physician.id,
      appliedByRole: physician.role,
      clinicId:      physician.clinicId,
      appliedAt:     new Date().toISOString(),
    });
    res.json(proposal);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Apply failed",
    });
  }
});

export default router;
