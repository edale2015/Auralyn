import { Router } from "express";
import { logCFR11Entry, getAuditChain, getAuditEntriesForCase, verifyCFR11Chain, exportCFR11Report } from "./cfr11AuditLogger";

const router = Router();

router.post("/log", (req, res) => {
  const { actor, action } = req.body;
  if (!actor || !action) return res.status(400).json({ ok: false, error: "actor and action required" });
  const entry = logCFR11Entry(req.body);
  res.json({ ok: true, entry });
});

router.get("/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "100"));
  res.json({ ok: true, entries: getAuditChain(limit), total: getAuditChain(9999).length });
});

router.get("/log/case/:caseId", (req, res) => {
  const entries = getAuditEntriesForCase(req.params.caseId);
  res.json({ ok: true, caseId: req.params.caseId, count: entries.length, entries });
});

router.get("/verify", (_req, res) => {
  const result = verifyCFR11Chain();
  res.json({ ok: true, ...result });
});

router.get("/export/:caseId", (req, res) => {
  const report = exportCFR11Report(req.params.caseId);
  res.json({ ok: true, report });
});

export default router;
