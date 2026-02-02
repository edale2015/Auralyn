import { Router, Request, Response, NextFunction } from "express";
import { getStore } from "../intakeStorage";
import type { SubmitPayload } from "../intakeStorage/types";

export const summaryRouter = Router();
const store = getStore();

function requireProviderAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["x-provider-key"];
  const providerKey = process.env.PROVIDER_API_KEY;
  
  if (!providerKey) {
    return res.status(503).json({ ok: false, error: "Provider API not configured." });
  }
  
  if (authHeader !== providerKey) {
    return res.status(401).json({ ok: false, error: "Unauthorized. Invalid provider key." });
  }
  
  next();
}

summaryRouter.get("/api/provider/case/:caseId", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    return res.json({
      ok: true,
      caseId: c.caseId,
      status: c.status,
      intake: c.intake,
      assistant: c.assistant,
      updatedAt: c.updatedAt
    });
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});

function generateVisitNoteDraft(caseId: string, intake: SubmitPayload, assistant: any): string {
  const lines: string[] = [];
  
  lines.push("=== VISIT NOTE DRAFT ===");
  lines.push(`Case ID: ${caseId}`);
  lines.push(`Date: ${new Date().toLocaleDateString()}`);
  lines.push("");
  
  lines.push("CHIEF COMPLAINT:");
  lines.push(intake.chiefComplaint || "(Not provided)");
  lines.push("");
  
  lines.push("HISTORY OF PRESENT ILLNESS:");
  if (intake.freeText) {
    lines.push(intake.freeText);
  }
  if (intake.symptoms) {
    const positives = Object.entries(intake.symptoms)
      .filter(([_, v]) => v === "yes")
      .map(([k]) => k.replace(/_/g, " "));
    const negatives = Object.entries(intake.symptoms)
      .filter(([_, v]) => v === "no")
      .map(([k]) => k.replace(/_/g, " "));
    
    if (positives.length > 0) {
      lines.push(`Positive symptoms: ${positives.join(", ")}.`);
    }
    if (negatives.length > 0) {
      lines.push(`Denies: ${negatives.join(", ")}.`);
    }
  }
  lines.push("");
  
  lines.push("REVIEW OF SYSTEMS:");
  lines.push("Constitutional: See HPI above.");
  lines.push("");
  
  if (intake.meds && intake.meds.length > 0) {
    lines.push("CURRENT MEDICATIONS:");
    intake.meds.forEach((m: any) => lines.push(`- ${m.name || m}`));
    lines.push("");
  }
  
  if (intake.allergies && intake.allergies.length > 0) {
    lines.push("ALLERGIES:");
    intake.allergies.forEach((a: any) => lines.push(`- ${a.name || a}`));
    lines.push("");
  }
  
  if (intake.pmh) {
    lines.push("PAST MEDICAL HISTORY:");
    lines.push(JSON.stringify(intake.pmh));
    lines.push("");
  }
  
  lines.push("ASSESSMENT & PLAN:");
  if (assistant?.diagnosis) {
    lines.push(`Assessment: ${assistant.diagnosis}`);
  }
  if (assistant?.disposition) {
    lines.push(`Disposition: ${assistant.disposition}`);
  }
  if (assistant?.plan) {
    lines.push(`Plan: ${assistant.plan}`);
  }
  lines.push("");
  
  lines.push("TELEHEALTH CONSENT:");
  if (intake.consent) {
    lines.push(`Signed by: ${intake.consent.signatureName}`);
    lines.push(`Signed at: ${intake.consent.signedAt}`);
    lines.push(`Telehealth consent: ${intake.consent.telehealth ? "Yes" : "No"}`);
    lines.push(`Privacy acknowledgment: ${intake.consent.privacy ? "Yes" : "No"}`);
  }
  
  return lines.join("\n");
}

function generateBillingSuggestions(intake: SubmitPayload, assistant: any): string {
  const lines: string[] = [];
  
  lines.push("=== BILLING SUGGESTIONS ===");
  lines.push("");
  
  lines.push("SUGGESTED ICD-10 CODES:");
  const symptoms = intake.symptoms || {};
  if (symptoms.fever === "yes") lines.push("- R50.9 Fever, unspecified");
  if (symptoms.sore_throat === "yes") lines.push("- J02.9 Acute pharyngitis, unspecified");
  if (symptoms.cough === "yes") lines.push("- R05.9 Cough, unspecified");
  if (symptoms.runny_nose === "yes") lines.push("- J00 Acute nasopharyngitis (common cold)");
  if (symptoms.headache === "yes") lines.push("- R51 Headache");
  if (symptoms.fatigue === "yes") lines.push("- R53.83 Other fatigue");
  if (symptoms.ear_pain === "yes") lines.push("- H92.09 Otalgia, unspecified ear");
  if (symptoms.body_aches === "yes") lines.push("- M79.10 Myalgia, unspecified site");
  
  if (assistant?.suggestedDiagnoses) {
    assistant.suggestedDiagnoses.forEach((d: any) => {
      lines.push(`- ${d.icd10 || "?"}: ${d.name || d}`);
    });
  }
  lines.push("");
  
  lines.push("SUGGESTED CPT CODES:");
  lines.push("- 99421 Online digital E/M, 5-10 min (cumulative)");
  lines.push("- 99422 Online digital E/M, 11-20 min (cumulative)");
  lines.push("- 99423 Online digital E/M, 21+ min (cumulative)");
  lines.push("");
  
  lines.push("MODIFIERS:");
  lines.push("- 95 Synchronous Telemedicine Service");
  lines.push("");
  
  lines.push("NOTE: Verify codes against clinical documentation before submitting.");
  
  return lines.join("\n");
}

function generateIntakePacketHtml(caseId: string, intake: SubmitPayload, assistant: any): string {
  const note = generateVisitNoteDraft(caseId, intake, assistant);
  const billing = generateBillingSuggestions(intake, assistant);
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Intake Packet - ${caseId}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
    h2 { color: #2c5282; margin-top: 30px; }
    pre { background: #f7fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 5px; white-space: pre-wrap; }
    .metadata { background: #edf2f7; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <h1>Intake Packet</h1>
  <div class="metadata">
    <strong>Case ID:</strong> ${caseId}<br>
    <strong>Generated:</strong> ${new Date().toISOString()}<br>
    <strong>Status:</strong> Ready for EHR import
  </div>
  
  <h2>Visit Note Draft</h2>
  <pre>${note}</pre>
  
  <h2>Billing Suggestions</h2>
  <pre>${billing}</pre>
  
  <div class="footer">
    This document was auto-generated. Verify all information before submitting to EHR.
  </div>
</body>
</html>`;
}

summaryRouter.get("/api/provider/case/:caseId/note", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    const note = generateVisitNoteDraft(c.caseId, c.intake, c.assistant);
    
    if (req.query.format === "json") {
      return res.json({ ok: true, note });
    }
    
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(note);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});

summaryRouter.get("/api/provider/case/:caseId/billing", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    const billing = generateBillingSuggestions(c.intake, c.assistant);
    
    if (req.query.format === "json") {
      return res.json({ ok: true, billing });
    }
    
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(billing);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});

summaryRouter.get("/api/provider/case/:caseId/packet", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    const html = generateIntakePacketHtml(c.caseId, c.intake, c.assistant);
    
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="intake-packet-${c.caseId}.html"`);
    return res.send(html);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});

summaryRouter.get("/api/provider/case/:caseId/files", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    
    const attachmentIds = c.intake?.attachments || [];
    
    if (attachmentIds.length > 0) {
      const files = await Promise.all(
        attachmentIds.map(async (fileId: string) => {
          const meta = await store.getFileMeta(fileId);
          return {
            fileId,
            originalName: meta?.originalName || fileId,
            mimeType: meta?.mimeType || "application/octet-stream",
            downloadUrl: `/api/file/${fileId}`
          };
        })
      );
      return res.json({ ok: true, files });
    }
    
    return res.json({ ok: true, files: [] });
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});
