import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export const physicianAnalyticsRouter = Router();

physicianAnalyticsRouter.get("/api/physician-analytics", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const reviewed = await firestoreCaseStore.listCases({ limit: 500 });

    const stats: Record<string, {
      name: string;
      approvals: number;
      modifications: number;
      escalations: number;
      rejections: number;
      total: number;
      overrideCount: number;
    }> = {};

    const dispositionOverrides: { original: string; override: string; count: number }[] = [];
    const overrideMap: Record<string, number> = {};

    let totalResponseMs = 0;
    let responseSamples = 0;
    const reviewerTimes: Record<string, number[]> = {};

    for (const c of reviewed) {
      const rev = (c as any).physicianReview;
      if (!rev || !rev.reviewer?.id) continue;

      const rid = rev.reviewer.id;
      const rname = rev.reviewer.name || rid;
      if (!stats[rid]) {
        stats[rid] = { name: rname, approvals: 0, modifications: 0, escalations: 0, rejections: 0, total: 0, overrideCount: 0 };
      }

      stats[rid].total++;
      const status = (rev.status || "").toUpperCase();
      if (status === "APPROVED") stats[rid].approvals++;
      else if (status === "MODIFIED") { stats[rid].modifications++; stats[rid].overrideCount++; }
      else if (status === "ESCALATED") stats[rid].escalations++;
      else if (status === "REJECTED") stats[rid].rejections++;

      if (rev.finalDisposition && (c as any).triage?.disposition && rev.finalDisposition !== (c as any).triage?.disposition) {
        const key = `${(c as any).triage.disposition}→${rev.finalDisposition}`;
        overrideMap[key] = (overrideMap[key] || 0) + 1;
      }

      if (rev.reviewedAt && (c as any).createdAt) {
        const created = new Date((c as any).createdAt).getTime();
        const reviewed = new Date(rev.reviewedAt).getTime();
        if (!isNaN(created) && !isNaN(reviewed) && reviewed > created) {
          const deltaMs = reviewed - created;
          totalResponseMs += deltaMs;
          responseSamples++;
          if (!reviewerTimes[rid]) reviewerTimes[rid] = [];
          reviewerTimes[rid].push(deltaMs);
        }
      }
    }

    const overrides = Object.entries(overrideMap).map(([key, count]) => {
      const [original, override] = key.split("→");
      return { original, override, count };
    }).sort((a, b) => b.count - a.count);

    const reviewerList = Object.entries(stats).map(([id, s]) => ({
      id,
      name: s.name,
      total: s.total,
      approvals: s.approvals,
      modifications: s.modifications,
      escalations: s.escalations,
      rejections: s.rejections,
      overrideRate: s.total > 0 ? +(s.overrideCount / s.total * 100).toFixed(1) : 0,
      avgResponseMs: reviewerTimes[id]?.length
        ? Math.round(reviewerTimes[id].reduce((a, b) => a + b, 0) / reviewerTimes[id].length)
        : null,
    })).sort((a, b) => b.total - a.total);

    const volumeByStatus: Record<string, number> = { APPROVED: 0, MODIFIED: 0, ESCALATED: 0, REJECTED: 0, UNREVIEWED: 0 };
    for (const c of reviewed) {
      const status = ((c as any).physicianReview?.status || "UNREVIEWED").toUpperCase();
      volumeByStatus[status] = (volumeByStatus[status] || 0) + 1;
    }

    res.json({
      totalCases: reviewed.length,
      reviewedCases: reviewed.filter((c) => !!(c as any).physicianReview?.status).length,
      avgResponseMs: responseSamples > 0 ? Math.round(totalResponseMs / responseSamples) : null,
      overallOverrideRate: reviewerList.length > 0
        ? +(reviewerList.reduce((a, r) => a + r.overrideRate, 0) / reviewerList.length).toFixed(1)
        : 0,
      volumeByStatus: Object.entries(volumeByStatus).map(([status, count]) => ({ status, count })),
      reviewers: reviewerList,
      overrides,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load physician analytics" });
  }
});
