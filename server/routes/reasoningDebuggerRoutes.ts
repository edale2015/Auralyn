import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { runReasoningTrace } from "../reasoning/reasoningTraceEngine";

const router = Router();

router.post("/api/reasoning-debug", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { complaint, symptoms } = req.body;
  const trace = runReasoningTrace({ complaint: complaint || "general", symptoms: symptoms || [] });
  res.json(trace);
});

export default router;
