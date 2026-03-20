import { Router } from "express";
import { analyzeScreenshot, smartFill } from "./visionEngine";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/analyze", requireRole(["admin"]), async (req, res) => {
  const { screenshot } = req.body;

  if (!screenshot || typeof screenshot !== "string") {
    return res.status(400).json({ error: "screenshot (base64 string) required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const analysis = await analyzeScreenshot(screenshot);
    res.json({ ok: true, analysis });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/smart-fill", requireRole(["admin"]), async (req, res) => {
  const { pageContent, variables } = req.body;

  if (!pageContent || !variables) {
    return res.status(400).json({ error: "pageContent and variables required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const fillInstructions = await smartFill(pageContent, variables);
    res.json({ ok: true, fillInstructions });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
