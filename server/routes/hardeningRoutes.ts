import { Router, Request, Response } from "express";
import { buildComplaintHardeningQueue } from "../learning/complaintHardeningQueue";

const router = Router();

router.get("/api/skill-layer/hardening-queue", async (_req: Request, res: Response) => {
  try {
    const queue = await buildComplaintHardeningQueue();
    res.json({ ok: true, queue });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
