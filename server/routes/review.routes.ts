import { Router } from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import {
  getCase,
  listReviewQueue,
  setPhysicianReview,
} from "../services/caseService";
import { sendWhatsAppMessage } from "../whatsapp/send";
import { appendAuditEvent }    from "../governance/audit";
import { generateChartNote }   from "../assistant/telemedicineNoteService";

export const reviewRouter = Router();

reviewRouter.use("/api/review", requireReviewAuth);

reviewRouter.get("/api/review/queue", async (req, res) => {
  try {
    const state =
      (req.query.state as "NEEDS_REVIEW" | "TRIAGED") ?? "NEEDS_REVIEW";
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const cases = await listReviewQueue({ state, limit });
    res.json(cases);
  } catch (e: any) {
    console.error("[Review] queue error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewRouter.get("/api/review/case/:caseId", async (req, res) => {
  try {
    const doc = await getCase(req.params.caseId);
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(doc);
  } catch (e: any) {
    console.error("[Review] case error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewRouter.post("/api/review/case/:caseId", async (req, res) => {
  try {
    const { status, notes, finalDisposition, finalDx, reviewer } =
      req.body ?? {};
    if (!status) return res.status(400).json({ error: "missing status" });

    const nextState =
      status === "APPROVED" || status === "MODIFIED"
        ? "APPROVED"
        : "NEEDS_REVIEW";

    await setPhysicianReview(
      req.params.caseId,
      {
        status,
        notes: notes ?? "",
        finalDisposition: finalDisposition ?? null,
        finalDx: finalDx ?? null,
        reviewer: reviewer ?? { id: "phys1", name: "Physician" },
      },
      nextState
    );

    // ── Discharge instruction delivery ──────────────────────────────────────
    const dischargeText: string | undefined = req.body.dischargeText;

    if (
      dischargeText?.trim() &&
      (status === "APPROVED" || status === "SIGNED_OFF")
    ) {
      const doc      = await getCase(req.params.caseId);
      const phone    = doc?.source?.threadId;
      const isWA     = doc?.source?.channel === "whatsapp";

      if (isWA && phone) {
        sendWhatsAppMessage(phone, dischargeText).catch((err: Error) =>
          console.error("[Review] Discharge WA send failed", {
            caseId: req.params.caseId, error: err.message,
          })
        );

        appendAuditEvent({
          actor:      reviewer?.id ?? "phys1",
          action:     "DISCHARGE_INSTRUCTIONS_SENT",
          entityId:   req.params.caseId,
          entityType: "case",
          details: {
            channel:   "whatsapp",
            phone,
            status,
            charCount: dischargeText.length,
          },
        }).catch(() =>
          console.error("[Review] Discharge audit event write failed", {
            caseId: req.params.caseId,
          })
        );
      }
    }

    res.json({ ok: true, nextState });
  } catch (e: any) {
    console.error("[Review] review error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/review/case/:caseId/soap ────────────────────────────────────────
// Generates a SOAP ChartNote from CaseDoc fields. Called by AmbientNotePanel's
// "Stamp SOAP Note" button. Synchronous — no LLM call, pure extraction.
reviewRouter.post(
  "/api/review/case/:caseId/soap",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });

      const doc = await getCase(caseId);
      if (!doc) return res.status(404).json({ ok: false, error: "Case not found" });

      const sessionLike = {
        complaint:         doc.complaint?.slug    ?? doc.complaint ?? "",
        disposition:       doc.triage?.disposition ?? "",
        returnPrecautions: doc.triage?.returnPrecautions ?? {},
        medications:       doc.answers?.structured?.medications  ?? [],
        allergies:         doc.answers?.structured?.allergies    ?? [],
        conditions:        doc.answers?.structured?.conditions   ?? [],
        differential:      doc.triage?.differential ?? [],
        safetyAlerts:      doc.triage?.safetyAlerts ?? [],
        patientName:       doc.answers?.structured?.name ?? "Patient",
        answers:           doc.answers?.structured ?? {},
      };

      const note = generateChartNote(sessionLike as any);

      appendAuditEvent({
        actor:      (req as any).user?.id ?? "phys1",
        action:     "SOAP_NOTE_GENERATED",
        entityId:   caseId,
        entityType: "case",
        details: { charCount: note.rawText?.length ?? 0 },
      }).catch(() => {
        console.error("[Review] SOAP audit event write failed", { caseId });
      });

      return res.json({ ok: true, note });
    } catch (e: any) {
      console.error("[Review] SOAP generation failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message ?? "SOAP generation failed" });
    }
  }
);
