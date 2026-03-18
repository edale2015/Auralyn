import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { deploymentChecklist, googleEmailConfig } from "../config/deploymentChecklist";

const router = Router();

router.get("/gmail", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(
      googleEmailConfig.clientId &&
      googleEmailConfig.clientSecret &&
      googleEmailConfig.redirectUri
    ),
    redirectUri: googleEmailConfig.redirectUri,
    scopes: googleEmailConfig.scopes,
    checklist: deploymentChecklist,
  });
});

export default router;
