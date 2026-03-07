import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { buildDailyDigest } from "../services/opsDailyDigestBuilder";

export const opsDailyDigestRouter = Router();

opsDailyDigestRouter.get(
  "/",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const digest = await buildDailyDigest();
      res.json(digest);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to build daily digest" });
    }
  }
);
