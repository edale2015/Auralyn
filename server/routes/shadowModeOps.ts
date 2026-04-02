import { Router } from "express";
import { shadowModeConfig, persistShadowModeToRedis } from "../config/shadowMode";
import { requireRole } from "../middleware/requireRole";

export const shadowModeOpsRouter = Router();

shadowModeOpsRouter.get(
  "/config",
  requireRole(["admin", "physician", "staff"]),
  async (_req, res) => {
    res.json(shadowModeConfig);
  }
);

shadowModeOpsRouter.patch(
  "/config",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    try {
      const allowed: Array<keyof typeof shadowModeConfig> = [
        "enabled",
        "allowExportAfterSignoffOnly",
        "autoCloseAfterExport",
        "requirePhysicianSignoffForAllCases",
        "logEveryEngineRun",
        "logEveryDiscrepancy",
      ];
      for (const key of allowed) {
        if (key in req.body) {
          (shadowModeConfig as any)[key] = req.body[key];
        }
      }
      await persistShadowModeToRedis();
      res.json({ ok: true, config: shadowModeConfig });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);
