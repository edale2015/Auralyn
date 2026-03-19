import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateClinicalExplanation } from "../engines/gptExplanationEngine";

const router = Router();

router.post("/explain", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  const { complaint, answers, evaluation } = req.body;
  if (!complaint) {
    return res.status(400).json({ error: "complaint required" });
  }

  try {
    const explanation = await generateClinicalExplanation({
      complaint,
      answers: answers || {},
      evaluation: evaluation || {},
    });
    res.json({ explanation, generated: true });
  } catch (err: any) {
    res.status(503).json({
      error: "Clinical explanation service temporarily unavailable",
      generated: false,
      detail: process.env.NODE_ENV !== "production" ? err.message : undefined,
    });
  }
});

export default router;
