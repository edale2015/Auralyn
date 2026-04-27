// ─────────────────────────────────────────────────────────────────────────────
// PATCH FILE — review.routes.ts
// Two sections to apply. Do NOT replace the whole file — apply each section
// as a targeted edit in the exact location described.
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ADD TWO IMPORTS
// Location: top of review.routes.ts, after the existing import block (line 7)
// Add these two lines immediately after the closing brace of the caseService import
// ═══════════════════════════════════════════════════════════════════════════════

import { sendWhatsAppMessage } from "../whatsapp/send";
import { appendAuditEvent }    from "../governance/audit";

// Your imports block should look like this after the edit:
//
//   import { Router } from "express";
//   import { requireReviewAuth } from "../middleware/reviewAuth";
//   import {
//     getCase,
//     listReviewQueue,
//     setPhysicianReview,
//   } from "../services/caseService";
//   import { sendWhatsAppMessage } from "../whatsapp/send";     ← NEW
//   import { appendAuditEvent }    from "../governance/audit";  ← NEW
//
//   export const reviewRouter = Router();


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — DISCHARGE DELIVERY BLOCK
// Location: inside POST /api/review/case/:caseId handler
//           AFTER setPhysicianReview() resolves
//           BEFORE res.json()
//
// Paste this entire block in that location exactly as written.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Discharge instruction delivery ───────────────────────────────────────────
//
// Design decisions documented here for audit trail / future maintainers:
//
// 1. GATING: Only fires when status is APPROVED or SIGNED_OFF AND the physician
//    explicitly approved instructions in the UI (dischargeText is non-empty).
//    Empty string / undefined = physician did not generate or approve = no send.
//
// 2. CHANNEL GATE: Only sends via WhatsApp when source.channel === "whatsapp"
//    AND source.threadId is present. Web/telegram cases are silently skipped —
//    no error, no broken flow. Future channels (SMS, email) can extend here.
//
// 3. FIRE-AND-FORGET: sendWhatsAppMessage is not awaited so a Twilio failure
//    cannot block the physician review action or leave the case in a bad state.
//    Failures are logged to console for ops visibility.
//
// 4. AUDIT EVENT: appendAuditEvent IS awaited-with-catch so a DB write failure
//    also cannot block case completion. Details logged include phone (for ops
//    tracing) and charCount (for volume monitoring) but NOT the instruction
//    text itself — the audit chain is not a PHI store.
//
// 5. PHI SAFETY: dischargeText is never written to the audit chain, Redis,
//    or any log. phone is included in audit details because it is operationally
//    necessary for tracing delivery failures (consistent with HIPAA ops use).

const dischargeText: string | undefined = req.body.dischargeText;

if (
  dischargeText?.trim() &&
  (status === "APPROVED" || status === "SIGNED_OFF")
) {
  // Re-use the case doc already fetched by setPhysicianReview if available,
  // otherwise fetch inline. getCase() is cheap (indexed PK lookup).
  const doc = await getCase(req.params.caseId);
  const phone      = doc?.source?.threadId;
  const isWhatsApp = doc?.source?.channel === "whatsapp";

  if (isWhatsApp && phone) {

    // ── Send (fire-and-forget) ──────────────────────────────────────────────
    sendWhatsAppMessage(phone, dischargeText).catch((err: Error) =>
      console.error(
        "[Review] Discharge WA send failed",
        { caseId: req.params.caseId, error: err.message }
      )
    );

    // ── Audit event (non-blocking) ──────────────────────────────────────────
    appendAuditEvent({
      actor:      reviewer?.id ?? "phys1",
      action:     "DISCHARGE_INSTRUCTIONS_SENT",
      entityId:   req.params.caseId,
      entityType: "case",
      details: {
        channel:    "whatsapp",
        phone,                          // ops tracing only — acceptable PHI use
        status,                         // which review action triggered the send
        charCount:  dischargeText.length, // volume monitoring, no content
        // dischargeText intentionally OMITTED — audit chain is not a PHI store
      },
    }).catch(() => {
      // Audit write failure is non-fatal — case action already succeeded.
      // A missing audit event is recoverable; a blocked physician action is not.
      console.error("[Review] Discharge audit event write failed", {
        caseId: req.params.caseId,
      });
    });

  }
  // If channel is "web" or "telegram", or threadId is absent:
  // silently skip — no error thrown, res.json() proceeds normally below.
}

// ── res.json() goes here (your existing response line, unchanged) ─────────────


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — FRONTEND: CaseReview.tsx reviewMutation (ONE LINE CHANGE)
// Location: inside mutationFn, in the apiRequest body object
// Add dischargeText as the last field before the closing })
// ═══════════════════════════════════════════════════════════════════════════════

// Your reviewMutation mutationFn should look like this after the edit:
//
//   mutationFn: async (status: string) => {
//     return apiRequest("POST", `/api/review/case/${caseId}`, {
//       status,
//       notes,
//       finalDisposition: c?.triage?.disposition ?? null,
//       finalDx:          c?.triage?.topCluster  ?? null,
//       reviewer:         { id: "phys1", name: "Physician" },
//       dischargeText:    dischargeText || undefined,  ← ADD THIS LINE ONLY
//     });
//   },
//
// dischargeText || undefined means:
//   - empty string  → undefined → server receives nothing → no send
//   - approved text → string   → server receives it      → send fires
// This avoids sending an empty field on every single review action.
