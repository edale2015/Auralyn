/**
 * Control Tower Dashboard API
 */

import express from "express";
import { getSystemMetrics } from "./metrics";

const router = express.Router();

router.get("/system-status", async (_req, res) => {
  try {
    const metrics = await getSystemMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
