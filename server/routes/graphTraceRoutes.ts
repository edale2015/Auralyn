import express from "express";
import { buildGraphTrace } from "../services/graphTraceService";

const router = express.Router();

router.post("/api/skill-layer/graph-trace", async (req, res) => {
  try {
    const trace = buildGraphTrace(req.body.context);
    res.json({ ok: true, trace });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
