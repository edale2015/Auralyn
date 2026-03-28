import { Router } from "express";
import {
  buildPARequest, submitPA, appealPA,
  getPA, getAllPAs, getPAStats,
} from "../revenue/priorAuthEngine";

const router = Router();

router.get("/queue", (_req, res) => {
  res.json({ ok: true, queue: getAllPAs(100), stats: getPAStats() });
});

router.get("/:paId", (req, res) => {
  const pa = getPA(req.params.paId);
  if (!pa) return res.status(404).json({ ok: false, error: "PA not found" });
  res.json({ ok: true, pa });
});

router.post("/create", (req, res) => {
  try {
    const pa = buildPARequest(req.body);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:paId/submit", async (req, res) => {
  try {
    const pa = await submitPA(req.params.paId);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:paId/appeal", async (req, res) => {
  try {
    const { notes = "Additional clinical documentation provided." } = req.body;
    const pa = await appealPA(req.params.paId, notes);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/stats/summary", (_req, res) => {
  res.json({ ok: true, stats: getPAStats() });
});

export default router;
