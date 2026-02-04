import { Router, Request, Response, NextFunction } from "express";
import { getStore, getActiveDriver } from "../intakeStorage";
import type { DraftPayload, SubmitPayload } from "../intakeStorage/types";
import { requireProviderAuth } from "../auth";
import { verifyCodeLimiter } from "../rateLimit";

export const intakeRouter = Router();

intakeRouter.get("/api/intake/_driver", (_req: Request, res: Response) => {
  const driver = getActiveDriver();
  const uploadsMode = process.env.UPLOADS_MODE === "firebase_storage" ? "firebase_storage" : "local_disk";
  const response: Record<string, any> = {
    ok: true,
    driver,
    uploadsMode
  };
  
  if (driver === "firestore") {
    response.firestoreProjectId = process.env.FIREBASE_PROJECT_ID || null;
  }
  
  res.json(response);
});
const store = getStore();

function computeRedFlags(body: SubmitPayload): string[] {
  const flags: string[] = [];
  const s = body.symptoms || {};
  if (s["chest_pain"] === "yes") flags.push("Chest pain");
  if (s["shortness_of_breath"] === "yes") flags.push("Shortness of breath");
  if (s["confusion"] === "yes") flags.push("Confusion");
  return flags;
}

function computeTriage(body: SubmitPayload): string {
  const flags = computeRedFlags(body);
  if (flags.length) return "Urgent screen: needs clinician review now";
  return "Routine";
}

export async function requireVerifiedSession(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  
  try {
    const verified = await store.isSessionVerified(token);
    if (!verified) {
      return res.status(401).json({ ok: false, error: "Session not verified or expired. Please enter your code first." });
    }
    next();
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: e?.message || "Session verification failed." });
  }
}

intakeRouter.post("/api/intake/:token/verify", verifyCodeLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const code = String(req.body?.code || "").trim();
    if (!code || code.length < 4) {
      return res.status(400).json({ ok: false, error: "Missing code." });
    }

    const session = await store.verifySession(token, code);
    const c = await store.getOrCreateCaseForToken(token);

    return res.json({
      ok: true,
      caseId: c.caseId,
      status: c.status,
      currentStep: c.currentStep,
      flowId: "DEFAULT_FLOW",
      sessionExpiresAtMs: session?.sessionExpiresAtMs || null
    });
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: e?.message || "Verify failed" });
  }
});

intakeRouter.post("/api/intake/:token/save_draft", requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const body = req.body as DraftPayload;
    await store.setCaseDraft(token, body);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Draft save failed" });
  }
});

intakeRouter.post("/api/intake/:token/submit", requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const intake = req.body as SubmitPayload;

    if (!intake?.consent?.telehealth || !intake?.consent?.privacy || !intake?.consent?.signatureName) {
      return res.status(400).json({ ok: false, error: "Consent is required." });
    }

    const assistant = {
      triageLevel: computeTriage(intake),
      redFlags: computeRedFlags(intake),
      draftNote: `HPI: ${intake.chiefComplaint}\n\nPatient-reported symptoms recorded via portal.`
    };

    const { caseId } = await store.setCaseSubmitted(token, intake, assistant);
    return res.json({ ok: true, caseId });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Submit failed" });
  }
});

intakeRouter.get("/api/intake/:token/status", requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const s = await store.getStatus(token);
    return res.json(s);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});

intakeRouter.get("/api/intake/:token/summary", requireVerifiedSession, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const html = await store.getSummaryHtml(token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (e: any) {
    return res.status(403).send(e?.message || "Summary not available");
  }
});

intakeRouter.post("/api/admin/case/:caseId/sign", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    await store.signCase(req.params.caseId);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Sign failed" });
  }
});

intakeRouter.get("/api/admin/case/:caseId", requireProviderAuth, async (req: Request, res: Response) => {
  try {
    const c = await store.getCase(req.params.caseId);
    return res.json({ ok: true, ...c });
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message || "Not found" });
  }
});
