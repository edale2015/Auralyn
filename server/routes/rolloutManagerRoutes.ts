import express from "express";
import { getRolloutModes, setRolloutMode } from "../platform/rolloutManagerService";

const router = express.Router();

router.get("/api/platform/rollout-modes", async (req, res) => {
  try {
    const siteId = String(req.query.siteId ?? "default");
    const result = await getRolloutModes(siteId);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/platform/rollout-modes", async (req, res) => {
  try {
    const result = await setRolloutMode({
      siteId: req.body.siteId ?? "default",
      complaint: req.body.complaint,
      mode: req.body.mode,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
