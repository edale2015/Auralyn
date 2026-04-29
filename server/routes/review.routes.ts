import { Router } from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import {
  getCase,
  listReviewQueue,
  patchCaseDoc,
  setPhysicianReview,
} from "../services/caseService";
import { classifyAndPersist } from "../services/caseTypeClassifier";
import { sendWhatsAppMessage } from "../whatsapp/send";
import { appendAuditEvent }    from "../governance/audit";
import { generateChartNote }      from "../assistant/telemedicineNoteService";
import { routeToSpecialtyCouncil } from "../assistant/specialtyRouter";
import { enrollInFollowUp }        from "../followup/followUpService";
import { OntologyFirewall }         from "../ontology/ontologyFirewall";
import { OntologyFieldMapper }      from "../ontology/ontologyFieldMapper";

export const reviewRouter = Router();

reviewRouter.use("/api/review", requireReviewAuth);

reviewRouter.get("/api/review/queue", async (req, res) => {
  try {
    const state =
      (req.query.state as "NEEDS_REVIEW" | "TRIAGED") ?? "NEEDS_REVIEW";
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const cases = await listReviewQueue({ state, limit });
    const enriched = cases.map((c: any) => {
      const withCaseType = c.caseType
        ? { ...c, caseTypePending: false }
        : (() => { classifyAndPersist(c.caseId, c, patchCaseDoc).catch(() => {}); return { ...c, caseTypePending: true }; })();
      // ── Win 14 Step 7: Enrich every queued case with ontology _ont fields ──
      // Frontend CaseSnapshotCard.tsx can use c._ont.returnPrecautionsKey,
      // c._ont.dispositionLabel, c._ont.isAsyncSafe, etc.
      return OntologyFieldMapper.enrichCaseDoc(withCaseType);
    });
    res.json(enriched);
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
        // ── Win 14 Gate 3: Discharge Ontology Firewall ──────────────────────
        const dischargeGate = await OntologyFirewall.guardDischarge({
          caseId:        req.params.caseId,
          dischargeText: dischargeText!,
          physicianId:   reviewer?.id,
          patientPhone:  phone,
          channel:       "whatsapp",
        });
        if (dischargeGate.blocked) {
          console.error(`[OntologyFirewall] Discharge blocked for ${req.params.caseId}: ${dischargeGate.reason}`);
          appendAuditEvent({
            actor:      reviewer?.id ?? "system",
            action:     "DISCHARGE_ONTOLOGY_BLOCKED",
            entityId:   req.params.caseId,
            entityType: "case",
            details:    { reason: dischargeGate.reason, violations: dischargeGate.violations.map(v => v.constraint) },
          }).catch(() => {});
        } else {
          if (dischargeGate.warnings.length > 0) {
            console.warn(`[OntologyFirewall] Discharge warnings for ${req.params.caseId}:`, dischargeGate.warnings);
          }
          sendWhatsAppMessage(phone, dischargeText!).catch((err: Error) =>
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
              charCount: dischargeText!.length,
            },
          }).catch(() =>
            console.error("[Review] Discharge audit event write failed", {
              caseId: req.params.caseId,
            })
          );
        }
      }
    }

    // ── Auto-enroll in follow-up if complaint has a protocol ──────────────────
    if (status === "APPROVED" || status === "SIGNED_OFF") {
      const followUpDoc  = await getCase(req.params.caseId);
      const phone        = followUpDoc?.source?.threadId;
      const slug         = followUpDoc?.complaint?.slug ?? followUpDoc?.complaint;
      const isWhatsApp   = followUpDoc?.source?.channel === "whatsapp";

      if (isWhatsApp && phone && slug) {
        // ── Win 14 Gate 4: Follow-Up Ontology Firewall ─────────────────────
        const followUpGate = await OntologyFirewall.guardFollowUpEnrollment({
          caseId:        req.params.caseId,
          complaintSlug: typeof slug === "string" ? slug : (slug?.slug ?? ""),
          patientPhone:  phone,
          disposition:   followUpDoc?.triage?.disposition,
        });
        if (followUpGate.blocked) {
          console.error(`[OntologyFirewall] Follow-up enrollment blocked for ${req.params.caseId}: ${followUpGate.reason}`);
        } else {
          if (followUpGate.warnings.length > 0) {
            console.warn(`[OntologyFirewall] Follow-up warnings for ${req.params.caseId}:`, followUpGate.warnings);
          }
          enrollInFollowUp({
            caseId:        req.params.caseId,
            complaintSlug: typeof slug === "string" ? slug : (slug?.slug ?? ""),
            patientPhone:  phone,
            patientName:   followUpDoc?.answers?.structured?.name ?? "Patient",
            physicianId:   reviewer?.id ?? (req as any).user?.id,
          }).catch((err: Error) =>
            console.error("[Review] Follow-up enrollment failed", { caseId: req.params.caseId, err: err.message })
          );
        }
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

// ── POST /api/review/case/:caseId/econsult ────────────────────────────────────
// Generates a structured eConsult draft. No audit event — draft generation is
// read-only. Uses routeToSpecialtyCouncil() to auto-select specialty.
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

      // routeToSpecialtyCouncil returns { primary, secondary, confidence, reason }
      // Note: field is .primary (not .specialty) per SpecialtyRoutingResult interface
      const routing = routeToSpecialtyCouncil(complaint ?? "", differential);
      const specialty           = routing?.primary ?? "general";
      const specialtyConfidence = routing?.confidence ?? 0;

      const topDx     = differential[0]?.diagnosis ?? topCluster ?? "undifferentiated complaint";
      const topDxConf = differential[0]?.confidence
        ? ` (${Math.round(differential[0].confidence * 100)}% confidence)`
        : "";

      const dxList = differential
        .slice(0, 3)
        .map((d: any, i: number) => `  ${i + 1}. ${d.diagnosis} (${Math.round((d.confidence ?? 0) * 100)}%)`)
        .join("\n");

      const medList     = patientMedications.length ? patientMedications.join(", ") : "None reported";
      const allergyList = allergies.length           ? allergies.join(", ")          : "NKDA";

      const specialtyLabel   = specialty.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
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

Overall AI Confidence: ${confidence ? `${Math.round(Number(confidence) * 100)}%` : "N/A"}

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

      return res.json({ ok: true, specialty, specialtyConfidence, draftText });
    } catch (e: any) {
      console.error("[Review] eConsult draft generation failed", e?.message);
      return res.status(500).json({ ok: false, error: e?.message ?? "Draft generation failed" });
    }
  }
);

// ── POST /api/review/case/:caseId/econsult/submit ─────────────────────────────
// Writes ECONSULT_ORDER_PLACED audit event. draftText intentionally excluded
// from audit details — audit chain is not a PHI store.
reviewRouter.post(
  "/api/review/case/:caseId/econsult/submit",
  requireReviewAuth,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });

      const { specialty, charCount } = req.body;
      if (!specialty) return res.status(400).json({ ok: false, error: "specialty required" });

      const auditEventId = await appendAuditEvent({
        actor:      (req as any).user?.id ?? "phys1",
        action:     "ECONSULT_ORDER_PLACED",
        entityId:   caseId,
        entityType: "case",
        details: {
          specialty,
          charCount: charCount ?? 0,
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
