import { Router, Request, Response } from "express";
import {
  getCaseByToken,
  createCase,
  saveDraft,
  submitIntake,
  getCaseStatus,
  getCaseSummary,
  addAttachment
} from "../services/intakeService";
import { storage } from "../storage";

const router = Router();

router.post("/:token/verify", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { code, dob } = req.body || {};

    if (!code) {
      return res.status(400).json({ ok: false, error: "Code is required" });
    }

    const encounter = await storage.getEncounterByIntakeToken(token);
    if (!encounter) {
      return res.status(404).json({ ok: false, error: "Invalid or expired link" });
    }

    if (encounter.intakeCode !== code) {
      return res.status(401).json({ ok: false, error: "Invalid code" });
    }

    if (encounter.intakeExpiresAt && Date.now() > encounter.intakeExpiresAt) {
      return res.status(401).json({ ok: false, error: "Link has expired. Reply LINK on WhatsApp for a new one." });
    }

    let existingCase = await getCaseByToken(token);
    if (!existingCase) {
      const flowId = (encounter as any).flowId || "ENT_FLU_LIKE_V1";
      const phone = encounter.phoneNumber || "";
      existingCase = await createCase(token, phone, flowId);
    }

    return res.json({
      ok: true,
      flowId: existingCase.flowId,
      caseId: existingCase.caseId,
      patientDisplayName: existingCase.patient?.name || undefined,
      status: existingCase.status
    });
  } catch (e: any) {
    console.error("verify error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.post("/:token/save_draft", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { draft, currentStep } = req.body || {};

    if (!draft || currentStep === undefined) {
      return res.status(400).json({ ok: false, error: "Missing draft or currentStep" });
    }

    const result = await saveDraft(token, draft, currentStep);
    return res.json(result);
  } catch (e: any) {
    console.error("save_draft error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.post("/:token/submit", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      answers,
      modifiers,
      meds,
      allergies,
      pmh,
      pharmacy,
      attachments,
      consent,
      chiefComplaint
    } = req.body || {};

    if (!answers || !consent) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    if (!consent.telehealth || !consent.privacy) {
      return res.status(400).json({ ok: false, error: "Consent is required" });
    }

    const result = await submitIntake(token, {
      answers,
      modifiers: modifiers || {},
      meds: meds || [],
      allergies: allergies || [],
      pmh: pmh || {},
      pharmacy: pharmacy || {},
      attachments: attachments || [],
      consent,
      chiefComplaint
    });

    return res.json(result);
  } catch (e: any) {
    console.error("submit error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.get("/:token/status", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const status = await getCaseStatus(token);

    if (!status) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    return res.json({ ok: true, ...status });
  } catch (e: any) {
    console.error("status error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.get("/:token/summary", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const result = await getCaseSummary(token);

    if (!result.ok) {
      return res.status(result.error === "Case not found" ? 404 : 400).json(result);
    }

    res.setHeader("Content-Type", "text/html");
    return res.send(result.html);
  } catch (e: any) {
    console.error("summary error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.post("/:token/upload", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const fileId = `FILE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const addResult = await addAttachment(token, fileId);
    if (!addResult.ok) {
      return res.status(400).json(addResult);
    }

    return res.json({ ok: true, fileId });
  } catch (e: any) {
    console.error("upload error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;
