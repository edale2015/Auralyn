import { Router }               from "express";
import { getSafetyBlockLog, getSafetySummary } from "../safety/safetyGuard";
import { getDemoDrift }          from "../services/driftMonitor";
import { runAllGoldenCases }     from "../golden/goldenRunner";
import { computeMetrics }        from "../fda/metricsEngine";
import { stratify }              from "../fda/stratifiedAnalysis";
import { getAuditChain }         from "../fda/cfr11AuditLogger";
import { goldenStore }           from "./testGoldenRoutes";
import {
  getCurrentVersion, getReleases, getReleaseSummary,
  lockVersion, promoteIfValid, freezeLearning, releaseExperimental,
} from "../release/releaseManager";
import { getLearningGuardStatus } from "../learning/learningGuard";
import { getAllWeights }          from "../learning/weightStore";

const router = Router();

// ─── GET /api/fda-dashboard/status ────────────────────────────────────────
// Combined live status for top header bar
router.get("/status", (_req, res) => {
  const release   = getReleaseSummary();
  const drift     = getDemoDrift();
  const safety    = getSafetySummary();
  const learning  = getLearningGuardStatus();

  res.json({
    ok: true,
    version:       release.currentVersion,
    isLocked:      release.isLocked,
    driftDetected: drift.driftDetected,
    driftSeverity: drift.severity,
    safetyBlocks:  safety.last24hBlocks ?? 0,
    weightCount:   learning.weightCount,
    systemHealth:  drift.severity === "none" && (safety.last24hBlocks ?? 0) === 0 ? "green" :
                   drift.severity === "moderate" || (safety.last24hBlocks ?? 0) > 5  ? "red" : "yellow",
    ts:            new Date().toISOString(),
  });
});

// ─── GET /api/fda-dashboard/drift ─────────────────────────────────────────
router.get("/drift", (_req, res) => {
  const result = getDemoDrift();
  res.json({ ok: true, ...result });
});

// ─── GET /api/fda-dashboard/safety ────────────────────────────────────────
router.get("/safety", (_req, res) => {
  const summary = getSafetySummary();
  const log     = getSafetyBlockLog().slice(0, 10);
  res.json({ ok: true, summary, log });
});

// ─── GET /api/fda-dashboard/learning ──────────────────────────────────────
router.get("/learning", (_req, res) => {
  const status  = getLearningGuardStatus();
  const weights = getAllWeights();
  res.json({ ok: true, ...status, allWeights: weights });
});

// ─── POST /api/fda-dashboard/validate ─────────────────────────────────────
// Runs full FDA validation using the golden runner + control-tower golden store
router.post("/validate", async (_req, res) => {
  try {
    const goldenResults = await runAllGoldenCases();

    const validationResults = goldenResults.map(r => ({
      input:      { caseId: r.caseId, complaint: r.rawOutput?.complaint ?? r.caseId, age: 35 },
      predicted:  r.matchedKeywords?.[0] ?? null,
      actual:     r.caseId.replace(/^gc-\d+-/, "").replace(/-/g, "_"),
      correct:    r.passed,
      safety:     r.blocked ? "HIGH" : "low",
      confidence: r.passed ? 0.9 : 0.4,
    }));

    // Add control-tower manual golden cases
    for (const c of goldenStore.values()) {
      validationResults.push({
        input:      (c.input as any) ?? {},
        predicted:  (c.result as any)?.diagnosis ?? null,
        actual:     (c.expected as any)?.diagnosis ?? "unknown",
        correct:    c.status === "pass",
        safety:     "low",
        confidence: c.status === "pass" ? 0.9 : 0.5,
      });
    }

    const metrics   = computeMetrics(validationResults as any);
    const groups    = stratify(validationResults as any);

    const groupMetrics: Record<string, any> = {};
    for (const [k, g] of Object.entries(groups)) {
      if (k === "summary") continue;
      groupMetrics[k] = (g as any).metrics;
    }

    const { promoted, version: newVer, reason } = promoteIfValid(metrics);

    res.json({
      ok:          true,
      metrics,
      groupMetrics,
      totalCases:  validationResults.length,
      promoted,
      promotedVersion: newVer,
      promotionReason: reason,
      ranAt:       new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/fda-dashboard/audit ─────────────────────────────────────────
router.get("/audit", (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const chain = getAuditChain(limit);
  res.json({ ok: true, entries: chain, count: chain.length });
});

// ─── GET /api/fda-dashboard/release/versions ──────────────────────────────
router.get("/release/versions", (_req, res) => {
  res.json({ ok: true, releases: getReleases(), summary: getReleaseSummary() });
});

// ─── POST /api/fda-dashboard/release/lock ─────────────────────────────────
router.post("/release/lock", (req, res) => {
  const { version } = req.body ?? {};
  const result = lockVersion(version);
  res.json({ ok: true, ...result });
});

// ─── POST /api/fda-dashboard/release/freeze ───────────────────────────────
router.post("/release/freeze", (_req, res) => {
  const result = freezeLearning();
  res.json({ ok: true, ...result });
});

// ─── POST /api/fda-dashboard/release/experimental ─────────────────────────
router.post("/release/experimental", (req, res) => {
  const { label = "Experimental Build" } = req.body ?? {};
  const entry = releaseExperimental(label);
  res.json({ ok: true, release: entry });
});

// ─── GET /api/fda-dashboard/release/current ───────────────────────────────
router.get("/release/current", (_req, res) => {
  res.json({ ok: true, ...getReleaseSummary() });
});

export default router;
