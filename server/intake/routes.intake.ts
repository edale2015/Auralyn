import { Router, Request, Response, NextFunction } from "express";
import { getStore, getActiveDriver } from "../intakeStorage";
import type { DraftPayload, SubmitPayload } from "../intakeStorage/types";

export const intakeRouter = Router();

intakeRouter.get("/api/intake/_driver", (_req: Request, res: Response) => {
  res.json({ driver: getActiveDriver() });
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

intakeRouter.post("/api/intake/:token/verify", async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const code = String(req.body?.code || "").trim();
    if (!code || code.length < 4) {
      return res.status(400).json({ ok: false, error: "Missing code." });
    }

    await store.verifySession(token, code);
    const c = await store.getOrCreateCaseForToken(token);

    return res.json({
      ok: true,
      caseId: c.caseId,
      status: c.status,
      currentStep: c.currentStep,
      flowId: "DEFAULT_FLOW"
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
