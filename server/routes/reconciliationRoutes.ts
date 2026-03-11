import express from "express";
import { listReconciliations } from "../services/reconciliationService";

const router = express.Router();

router.get("/api/skill-layer/reconciliations", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    const rows = await listReconciliations(limit);
    res.json({ ok: true, rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
