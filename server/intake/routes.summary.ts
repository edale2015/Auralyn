import { Router, Request, Response, NextFunction } from "express";
import { getStore } from "../intakeStorage";

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
