import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { desc, gte } from "drizzle-orm";
import { kbKnowledgeChanges } from "../../shared/schema";
import { sql } from "drizzle-orm";

const router = Router();

router.use(requireRole(["admin", "physician"]));

// ── FDA Audit Export Package ─────────────────────────────────────────────────
router.get("/export-package", async (req: Request, res: Response) => {
  const since = req.query.since
    ? new Date(req.query.since as string)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days default

  try {
    const [kbChanges, auditHashRows, learningQueueRows, agentWeightRows] = await Promise.all([
      db.select().from(kbKnowledgeChanges).where(gte(kbKnowledgeChanges.createdAt, since)).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(500),
      db.execute(sql`SELECT id, hash, prev_hash, event_type, actor, created_at FROM audit_hash_chain ORDER BY created_at DESC LIMIT 200`).catch(() => ({ rows: [] })),
      db.execute(sql`SELECT id, type, risk_level, title, status, created_at, reviewed_at FROM learning_queue_items ORDER BY created_at DESC LIMIT 200`).catch(() => ({ rows: [] })),
      db.execute(sql`SELECT agent_id, weight, version, updated_at FROM agent_weights ORDER BY updated_at DESC`).catch(() => ({ rows: [] })),
    ]);

    const { getReleaseSummary } = await import("../release/releaseManager").catch(() => ({ getReleaseSummary: () => null }));
    const { getPhiAuditLog } = await import("../middleware/phiGuardOpenAI").catch(() => ({ getPhiAuditLog: () => [] }));
    const { getDeadLetterStats } = await import("../services/ehrDeadLetterService").catch(() => ({ getDeadLetterStats: () => null }));

    let releaseSummary: any = null;
    let phiAuditLog: any[] = [];
    let deadLetterStats: any = null;

    try { releaseSummary = getReleaseSummary?.(); } catch {}
    try { phiAuditLog = (getPhiAuditLog?.() ?? []).slice(0, 100); } catch {}
    try { deadLetterStats = getDeadLetterStats?.(); } catch {}

    const xRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);

    const pkg = {
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        sinceDate: since.toISOString(),
        generatedBy: (req as any).user?.email ?? "unknown",
        systemVersion: process.env.npm_package_version ?? "unknown",
        nodeEnv: process.env.NODE_ENV ?? "development",
      },
      kbChangeLog: {
        count: kbChanges.length,
        entries: kbChanges,
      },
      auditHashChain: {
        count: xRows(auditHashRows).length,
        entries: xRows(auditHashRows),
      },
      learningQueue: {
        count: xRows(learningQueueRows).length,
        entries: xRows(learningQueueRows),
      },
      agentWeights: {
        count: xRows(agentWeightRows).length,
        entries: xRows(agentWeightRows),
      },
      releaseSummary,
      phiAuditLog: {
        count: phiAuditLog.length,
        entries: phiAuditLog,
      },
      ehrDeadLetterStats: deadLetterStats,
      complianceSummary: {
        kbChangesWithPhysicianReview: kbChanges.filter(c => c.reviewedBy).length,
        kbChangesTotal: kbChanges.length,
        auditChainIntact: xRows(auditHashRows).length > 0,
        learningQueueApprovalRate: (() => {
          const q = xRows(learningQueueRows);
          const approved = q.filter((r: any) => r.status === "approved").length;
          return q.length > 0 ? `${((approved / q.length) * 100).toFixed(1)}%` : "N/A";
        })(),
      },
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="auralyn-audit-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(pkg);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Quick compliance summary (lightweight, for dashboard display) ────────────
router.get("/compliance-summary", async (_req: Request, res: Response) => {
  try {
    const [changeCount, chainCount, queueCount] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as n FROM kb_knowledge_changes WHERE created_at > NOW() - INTERVAL '30 days'`).catch(() => ({ rows: [{ n: 0 }] })),
      db.execute(sql`SELECT COUNT(*) as n FROM audit_hash_chain`).catch(() => ({ rows: [{ n: 0 }] })),
      db.execute(sql`SELECT COUNT(*) as n, status FROM learning_queue_items GROUP BY status`).catch(() => ({ rows: [] })),
    ]);

    const xRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
    const qRows = xRows(queueCount);

    res.json({
      kbChanges30d: Number(xRows(changeCount)[0]?.n ?? 0),
      auditChainEntries: Number(xRows(chainCount)[0]?.n ?? 0),
      learningQueue: {
        pending: Number(qRows.find((r: any) => r.status === "pending")?.n ?? 0),
        approved: Number(qRows.find((r: any) => r.status === "approved")?.n ?? 0),
        rejected: Number(qRows.find((r: any) => r.status === "rejected")?.n ?? 0),
      },
      exportUrl: "/api/audit/export-package",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
