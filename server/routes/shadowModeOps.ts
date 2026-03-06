import { Router } from "express";
import { shadowModeConfig } from "../config/shadowMode";
import { requireRole } from "../middleware/requireRole";

export const shadowModeOpsRouter = Router();

shadowModeOpsRouter.get(
  "/config",
  requireRole(["admin", "physician", "staff"]),
  async (_req, res) => {
    res.json(shadowModeConfig);
  }
);
