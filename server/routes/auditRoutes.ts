/**
 * server/routes/auditRoutes.ts
 *
 * FIX (Batch-1 Finding #10 — Medium): /api/clinical-audit-log now reads from
 * the DB-persisted audit_logs table via getRecentAuditLogs() instead of
 * the in-memory clinical change log from clinicalChangeAuditLog.ts.
 *
 * Previously: imported getAuditHistory from clinicalChangeAuditLog — which is
 * an in-memory change log that resets on restart. DB records existed in
 * audit_logs but were invisible to auditors using this endpoint.
 *
 * Also adds:
 *   GET /api/audit/chain/verify — full chain verification
 *   GET /api/audit/logs         — DB-backed log with pagination
 *   GET /api/audit/verification-runs — scheduled verification history
 */

import { Router, Request, Response } from "express";
import { requireRole }               from "../auth/requirePhysician";
import {
  getRecentAuditLogs,
  getTraceSteps,
  verifyEntireChain,
}                                    from "../audit/auditLogger";
import { analyzeChangeImpact }       from "../audit/changeImpactAnalyzer";
import { getAuditHistory, getAuditStats } from "../audit/clinicalChangeAuditLog";
import { getVerificationLog, runManualVerification } from "../audit/scheduledAuditVerifier";
import { verifyFullAuditChain }      from "../audit/auditVerifier";

const router = Router();

// ── DB-backed audit log — source of truth ────────────────────────────────────

router.get("/api/audit/logs", requireRole(["admin"]), async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  try {
    const logs = await getRecentAuditLogs(Math.min(limit, 1000));
    res.json({ count: logs.length, records: logs, source: "db" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch audit logs", detail: err?.message });
  }
});

router.get("/api/audit/trace/:traceId", requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const steps = await getTraceSteps(req.params.traceId);
    res.json({ traceId: req.params.traceId, steps, count: steps.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch trace", detail: err?.message });
  }
});

router.get("/api/audit/chain/verify", requireRole(["admin"]), async (_req: Request, res: Response) => {
  try {
    const result = await verifyFullAuditChain();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Chain verification failed", detail: err?.message });
  }
});

router.get("/api/audit/chain/verify-full", requireRole(["admin"]), async (_req: Request, res: Response) => {
  try {
    const result = await verifyEntireChain();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Full chain verification failed", detail: err?.message });
  }
});

router.get("/api/audit/verification-runs", requireRole(["admin"]), async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 90;
  try {
    const runs = await getVerificationLog(limit);
    res.json({ count: runs.length, runs });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch verification runs", detail: err?.message });
  }
});

router.post("/api/audit/verification-runs/manual", requireRole(["admin"]), async (req: Request, res: Response) => {
  const frequency = (req.body?.frequency ?? "nightly") as "nightly" | "weekly";
  try {
    const result = await runManualVerification(frequency);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Manual verification failed", detail: err?.message });
  }
});

// ── Legacy: in-memory clinical change log (kept for backward compat) ──────────

router.get("/api/clinical-audit-log", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  const sheet = req.query.sheet as string | undefined;

  let records = getAuditHistory(limit);
  if (sheet) records = records.filter((r: any) => r.sheet === sheet);

  const withImpact = records.map((r: any) => ({ ...r, impact: analyzeChangeImpact(r) }));
  res.json({ count: withImpact.length, records: withImpact, source: "memory", warning: "This is the in-memory KB change log, not the DB audit chain. Use /api/audit/logs for the persisted audit trail." });
});

router.get("/api/clinical-audit-log/stats", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(getAuditStats());
});

export default router;
