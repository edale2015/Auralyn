/**
 * clinicalBrainIntelRoutes.ts
 * API endpoints for Clinical Brain Intelligence observability.
 *
 * GET  /api/brain-intel/engine-health      — per-engine telemetry (last 20 runs)
 * GET  /api/brain-intel/engine-bandit      — bandit UCB scores for all engines
 * GET  /api/brain-intel/meta-weights       — meta-learning importance weights
 * GET  /api/brain-intel/oversight-drift    — current drift flag state
 * POST /api/brain-intel/oversight-drift    — set drift flag (admin only)
 * POST /api/brain-intel/meta-weights/outcome — record physician outcome feedback
 * GET  /api/brain-intel/council-stats      — council activation bandit stats
 * POST /api/brain-intel/council-feedback   — record council usefulness
 */

import { Router }    from "express";
import { getEngineTelemetry, summariseEngineTelemetry } from "../controlTower/engineTelemetry";
import { engineBandit }              from "../clinical/engineBandit";
import { metaLearning }              from "../meta/metaLearningEngine";
import { oversightAgent }            from "../oversight/oversightAgent";
import { councilActivationBandit }   from "../agents/councilActivationBandit";
import type { SpecialtyCouncil }     from "../agents/councilActivationBandit";
import { getRedisAsync }             from "../queue/redis";

const router = Router();

// ── Engine telemetry summary ───────────────────────────────────────────────────
router.get("/engine-health", async (_req, res) => {
  try {
    const raw = await getEngineTelemetry();
    const summary: Record<string, any> = {};

    for (const [engine, entries] of Object.entries(raw)) {
      summary[engine] = {
        ...summariseEngineTelemetry(entries),
        recentRuns: entries.slice(0, 10),
      };
    }

    res.json({ engines: summary, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Engine bandit UCB scores ───────────────────────────────────────────────────
router.get("/engine-bandit", async (_req, res) => {
  try {
    const records = await engineBandit.getAll().catch(() => ({}));
    res.json({ engines: records, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Meta-learning importance weights ──────────────────────────────────────────
router.get("/meta-weights", async (_req, res) => {
  try {
    const weights = await metaLearning.getAll().catch(() => ({}));
    const scale   = await metaLearning.getUncertaintyScale().catch(() => 1);
    res.json({ engineWeights: weights, uncertaintyScale: scale, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Oversight drift flag (read) ────────────────────────────────────────────────
router.get("/oversight-drift", async (_req, res) => {
  try {
    const redis = await getRedisAsync();
    let driftFlag = false;
    if (redis && typeof (redis as any).get === "function") {
      driftFlag = (await (redis as any).get("drift:flag")) === "true";
    }
    res.json({ driftDetected: driftFlag });
  } catch {
    res.json({ driftDetected: false });
  }
});

// ── Oversight drift flag (write, admin) ────────────────────────────────────────
router.post("/oversight-drift", async (req, res) => {
  try {
    const detected = Boolean(req.body?.detected);
    await oversightAgent.flagDrift(detected);
    res.json({ ok: true, driftDetected: detected });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Record physician outcome → meta-learning ──────────────────────────────────
router.post("/meta-weights/outcome", async (req, res) => {
  try {
    const { engines, outcomeImproved } = req.body ?? {};
    if (!Array.isArray(engines)) {
      return res.status(400).json({ error: "engines must be an array of strings" });
    }
    await metaLearning.recordOutcome(engines, Boolean(outcomeImproved));
    res.json({ ok: true, enginesUpdated: engines.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Council activation bandit stats ───────────────────────────────────────────
router.get("/council-stats", async (_req, res) => {
  try {
    const stats = await councilActivationBandit.getStats();
    res.json({ councils: stats, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Record council usefulness feedback ────────────────────────────────────────
router.post("/council-feedback", async (req, res) => {
  try {
    const { council, helpful } = req.body ?? {};
    const valid: SpecialtyCouncil[] = ["cardiology", "infectious_disease", "icu"];
    if (!valid.includes(council)) {
      return res.status(400).json({ error: `council must be one of: ${valid.join(", ")}` });
    }
    await councilActivationBandit.recordFeedback(council as SpecialtyCouncil, Boolean(helpful));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
