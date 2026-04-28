// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — review.routes.ts  (SOAP note endpoint)
// Add this block AFTER your existing reviewRouter routes, before module end.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ADD ONE IMPORT
// Location: top of review.routes.ts, with your existing imports
// ═══════════════════════════════════════════════════════════════════════════════

import { generateChartNote } from "../assistant/telemedicineNoteService";

// Your imports block after this addition:
//
//   import { Router } from "express";
//   import { requireReviewAuth } from "../middleware/reviewAuth";
//   import { getCase, listReviewQueue, setPhysicianReview } from "../services/caseService";
//   import { sendWhatsAppMessage } from "../whatsapp/send";         ← from Win 1
//   import { appendAuditEvent }    from "../governance/audit";      ← from Win 1
//   import { generateChartNote }   from "../assistant/telemedicineNoteService";  ← NEW


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — NEW ROUTE
// Location: paste after your existing POST /api/review/case/:caseId route,
//           before the end of the file.
//
// This endpoint is called by AmbientNotePanel's "Stamp SOAP Note" button.
// It fetches the case, builds a TelemedicineSession-shaped object from the
// CaseDoc fields, calls generateChartNote(), and returns rawText.
//
// NO physician gate needed here — this is read-only generation.
// The physician still edits and signs in the notes textarea below.
// ═══════════════════════════════════════════════════════════════════════════════

reviewRouter.post(
  "/api/review/case/:caseId/soap",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });

      // Fetch the full case doc
      const doc = await getCase(caseId);
      if (!doc) return res.status(404).json({ ok: false, error: "Case not found" });

      // Build a TelemedicineSession-compatible object from CaseDoc fields.
      // generateChartNote() reads: complaint, disposition, returnPrecautions,
      // medications, allergies, conditions, differential, safetyAlerts.
      // Map CaseDoc fields to those keys.
      const sessionLike = {
        complaint:        doc.complaint?.slug    ?? doc.complaint ?? "",
        disposition:      doc.triage?.disposition ?? "",
        returnPrecautions: doc.triage?.returnPrecautions ?? {},
        medications:      doc.answers?.structured?.medications    ?? [],
        allergies:        doc.answers?.structured?.allergies      ?? [],
        conditions:       doc.answers?.structured?.conditions     ?? [],
        differential:     doc.triage?.differential ?? [],
        safetyAlerts:     doc.triage?.safetyAlerts ?? [],
        patientName:      doc.answers?.structured?.name ?? "Patient",
        // Pass raw answers for HPI generation
        answers:          doc.answers?.structured ?? {},
      };

      // Generate the SOAP note — synchronous, no LLM call, pure extraction
      const note = generateChartNote(sessionLike as any);

      // Audit event — note generation is a clinical event
      await appendAuditEvent({
        actor:      req.user?.id ?? "phys1",
        action:     "SOAP_NOTE_GENERATED",
        entityId:   caseId,
        entityType: "case",
        details: {
          charCount: note.rawText?.length ?? 0,
          // rawText intentionally OMITTED — audit chain is not a PHI store
        },
      }).catch(() => {
        // Non-fatal — log failure does not block note delivery
        console.error("[Review] SOAP audit event write failed", { caseId });
      });

      return res.json({ ok: true, note });

    } catch (e: any) {
      console.error("[Review] SOAP generation failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message ?? "SOAP generation failed" });
    }
  }
);
