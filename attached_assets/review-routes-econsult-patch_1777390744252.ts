// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — review.routes.ts  (eConsult routes)
// Two new routes. Add after your existing routes, before end of file.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ADD ONE IMPORT
// Location: top of review.routes.ts, with your existing imports
// ═══════════════════════════════════════════════════════════════════════════════

import { routeToSpecialtyCouncil } from "../assistant/specialtyRouter";

// Full imports block after all three Win patches:
//
//   import { Router } from "express";
//   import { requireReviewAuth } from "../middleware/reviewAuth";
//   import { getCase, listReviewQueue, setPhysicianReview } from "../services/caseService";
//   import { sendWhatsAppMessage } from "../whatsapp/send";                         ← Win 1
//   import { appendAuditEvent }    from "../governance/audit";                      ← Win 1
//   import { generateChartNote }   from "../assistant/telemedicineNoteService";     ← Win 3
//   import { routeToSpecialtyCouncil } from "../assistant/specialtyRouter";         ← Win 4 NEW


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ROUTE 1: Generate eConsult draft
// POST /api/review/case/:caseId/econsult
//
// Called when the physician expands the EConsultPanel for the first time,
// or clicks Regenerate. Returns specialty + pre-drafted referral text.
// No audit event here — draft generation is read-only.
// ═══════════════════════════════════════════════════════════════════════════════

reviewRouter.post(
  "/api/review/case/:caseId/econsult",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });

      const {
        complaint,
        disposition,
        topCluster,
        differential = [],
        confidence,
        patientMedications = [],
        allergies = [],
      } = req.body;

      // ── Auto-select specialty ───────────────────────────────────────────────
      // routeToSpecialtyCouncil() pattern-matches complaint slug + top differential
      // Returns { specialty, confidence } — e.g. { specialty: "ent", confidence: 0.85 }
      const routing = routeToSpecialtyCouncil(
        complaint ?? "",
        differential
      );

      const specialty           = routing?.specialty ?? "general";
      const specialtyConfidence = routing?.confidence ?? 0;

      // ── Build draft text ────────────────────────────────────────────────────
      // Structured referral letter built from case fields.
      // No LLM call — deterministic template fill for speed and reliability.

      const topDx = differential[0]?.diagnosis ?? topCluster ?? "undifferentiated complaint";
      const topDxConf = differential[0]?.confidence
        ? ` (${Math.round(differential[0].confidence * 100)}% confidence)`
        : "";

      const dxList = differential
        .slice(0, 3)
        .map((d: any, i: number) => `  ${i + 1}. ${d.diagnosis} (${Math.round((d.confidence ?? 0) * 100)}%)`)
        .join("\n");

      const medList = patientMedications.length
        ? patientMedications.join(", ")
        : "None reported";

      const allergyList = allergies.length
        ? allergies.join(", ")
        : "NKDA";

      const specialtyLabel = specialty.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const dispositionLabel = disposition === "pcp" ? "Primary Care / Specialist" : "Urgent Care Follow-up";

      const draftText = `TO: ${specialtyLabel}
FROM: Urgent Care Physician
RE: eConsult Request — ${complaint?.replace(/_/g, " ") ?? "Clinical Consultation"}
DATE: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

─────────────────────────────────────────────────────
REASON FOR REFERRAL
─────────────────────────────────────────────────────
Patient presenting with ${complaint?.replace(/_/g, " ") ?? "chief complaint"} evaluated in urgent care today. Requesting ${specialtyLabel} consultation for further evaluation and management.

Disposition: ${dispositionLabel}

─────────────────────────────────────────────────────
AI-ASSISTED CLINICAL SUMMARY
─────────────────────────────────────────────────────
Primary Working Diagnosis: ${topDx}${topDxConf}

Differential Diagnoses Considered:
${dxList || "  See clinical notes"}

Overall AI Confidence: ${confidence ? `${Math.round(confidence * 100)}%` : "N/A"}

─────────────────────────────────────────────────────
RELEVANT HISTORY
─────────────────────────────────────────────────────
Current Medications: ${medList}
Allergies: ${allergyList}

─────────────────────────────────────────────────────
CLINICAL QUESTION
─────────────────────────────────────────────────────
[Physician: describe your specific question for the specialist here]

─────────────────────────────────────────────────────
URGENCY
─────────────────────────────────────────────────────
${disposition === "urgent_care" ? "URGENT — within 24–48 hours" : "Routine — within 1–2 weeks"}

─────────────────────────────────────────────────────
NOTE
─────────────────────────────────────────────────────
This draft was generated by AI clinical decision support and reviewed by the referring physician. All clinical decisions are the responsibility of the supervising physician.

Referring Physician: ________________________
Date: ${new Date().toLocaleDateString()}
`;

      return res.json({
        ok:                 true,
        specialty,
        specialtyConfidence,
        draftText,
      });

    } catch (e: any) {
      console.error("[Review] eConsult draft generation failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message ?? "Draft generation failed" });
    }
  }
);


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — ROUTE 2: Submit eConsult (audit event)
// POST /api/review/case/:caseId/econsult/submit
//
// Called when physician clicks "Submit Referral" in the EConsultPanel.
// Writes ECONSULT_ORDER_PLACED audit event — no Postgres orders FK needed.
// The draftText is intentionally NOT stored in audit details (PHI store rule).
// ═══════════════════════════════════════════════════════════════════════════════

reviewRouter.post(
  "/api/review/case/:caseId/econsult/submit",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });

      const { specialty, charCount } = req.body;

      if (!specialty) {
        return res.status(400).json({ ok: false, error: "specialty required" });
      }

      // Write to governance audit chain
      // draftText intentionally excluded — audit chain is not a PHI store
      const auditEventId = await appendAuditEvent({
        actor:      req.user?.id ?? "phys1",
        action:     "ECONSULT_ORDER_PLACED",
        entityId:   caseId,
        entityType: "case",
        details: {
          specialty,
          charCount:  charCount ?? 0,
          // draftText intentionally OMITTED — PHI store rule
        },
      });

      return res.json({ ok: true, auditEventId });

    } catch (e: any) {
      console.error("[Review] eConsult submit failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message ?? "Submit failed" });
    }
  }
);
