import { Router } from "express";
import { listWorkerHeartbeats } from "../repos/workerMonitorRepo";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await listWorkerHeartbeats();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list workers" });
  }
});

export default router;
