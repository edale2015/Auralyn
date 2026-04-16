/**
 * Clinical Answer Route — knowledge-base-grounded clinical query assistant.
 *
 * SAFETY BOUNDARY:
 *   • kbOnly: true  — this endpoint NEVER sets patient disposition
 *   • All LOW/MEDIUM confidence answers are queued for physician review
 *   • Every answer is audited with a SHA-256 tamper-evident hash
 *
 * POST /api/clinical-answer
 * GET  /api/clinical-answer/review-queue
 * POST /api/clinical-answer/review-decision
 */

import { Router }                    from "express";
import { getGroundedAnswer }         from "../ai/clinicalRagGrounding";
import { annotateWithUncertainty, formatForDashboard } from "../ai/uncertaintySignaling";
import { queueForReview, getPendingReviews, submitReviewDecision } from "../services/physicianReviewGate";
import { logClinicalAnswerAudit }    from "../services/clinicalAnswerAuditService";
import { requirePhysician }          from "../auth/requirePhysician";

const router = Router();

// ─── POST /api/clinical-answer ─────────────────────────────────────────────

router.post("/api/clinical-answer", requirePhysician, async (req, res) => {
  const { query, requestedBy, patientContextId } = req.body ?? {};

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const groundedAnswer = await getGroundedAnswer(query.trim());
    const signal         = annotateWithUncertainty(groundedAnswer);
    const formatted      = formatForDashboard(signal, query.trim());

    let reviewQueueId: number | null = null;

    if (signal.needsPhysicianReview) {
      reviewQueueId = await queueForReview({
        query:           query.trim(),
        proposedAnswer:  signal.annotatedAnswer,
        confidenceScore: signal.confidenceScore,
        confidenceLevel: signal.level,
        sourceCount:     signal.sourceCount,
        hedgeCount:      signal.hedgeWordsFound.length,
        patientContextId: patientContextId ?? undefined,
        requestedBy:     requestedBy ?? undefined,
      });
    }

    const auditPayload = {
      query:           query.trim(),
      confidenceLevel: signal.level,
      confidenceScore: signal.confidenceScore,
      sourceCount:     signal.sourceCount,
      needsPhysicianReview: signal.needsPhysicianReview,
      reviewQueueId,
      requestedBy:     requestedBy ?? null,
      patientContextId: patientContextId ?? null,
      boundary:        { kbOnly: true, canSetDisposition: false },
      ts:              new Date().toISOString(),
    };

    await logClinicalAnswerAudit(auditPayload);

    return res.json({
      ...formatted,
      reviewQueueId,
      boundary: { kbOnly: true, canSetDisposition: false },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── GET /api/clinical-answer/review-queue ─────────────────────────────────

router.get("/api/clinical-answer/review-queue", requirePhysician, async (_req, res) => {
  try {
    const items = await getPendingReviews();
    return res.json({ ok: true, items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ─── POST /api/clinical-answer/review-decision ─────────────────────────────

router.post("/api/clinical-answer/review-decision", requirePhysician, async (req, res) => {
  const { reviewId, decision, physicianId, note, finalAnswer } = req.body ?? {};

  if (!reviewId || !decision || !physicianId) {
    return res.status(400).json({ error: "reviewId, decision, and physicianId are required" });
  }

  const valid = ["approved", "overridden", "rejected"];
  if (!valid.includes(decision)) {
    return res.status(400).json({ error: `decision must be one of: ${valid.join(", ")}` });
  }

  try {
    await submitReviewDecision({
      reviewId:    Number(reviewId),
      decision,
      physicianId,
      note:        note ?? null,
      finalAnswer: finalAnswer ?? null,
    });

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
