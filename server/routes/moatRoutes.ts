/**
 * Moat Intelligence API
 * GET  /api/moat/scorecard          — full defensibility scorecard
 * GET  /api/moat/flywheel           — flywheel velocity + stats
 * GET  /api/moat/network            — cross-clinic network stats
 * GET  /api/moat/rare-cases         — rare case coverage
 * GET  /api/moat/clinic-values      — all clinic lock-in values
 * POST /api/moat/simulate-encounter — simulate adding an encounter to the flywheel
 */

import { Router } from "express";
import { computeMoatScorecard }         from "../moat/moatMetrics";
import { getFlywheelStats, recordFlywheelEntry, inferSpecialty } from "../moat/flywheelEngine";
import { getNetworkStats, recordNetworkContribution }            from "../moat/networkLearning";
import { getRareCaseStats, evaluateRarity }                      from "../moat/rareCaseEngine";
import { getAllClinicValues, updateClinicValue }                  from "../moat/clinicLockIn";

export const moatRoutes = Router();

/* ── scorecard ──────────────────────────────────────────────────────────── */
moatRoutes.get("/scorecard", async (_req, res) => {
  try {
    const scorecard = await computeMoatScorecard();
    return res.json(scorecard);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Scorecard computation failed" });
  }
});

/* ── flywheel ───────────────────────────────────────────────────────────── */
moatRoutes.get("/flywheel", async (_req, res) => {
  try {
    const stats = await getFlywheelStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Flywheel stats failed" });
  }
});

/* ── network ────────────────────────────────────────────────────────────── */
moatRoutes.get("/network", async (_req, res) => {
  try {
    const stats = await getNetworkStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Network stats failed" });
  }
});

/* ── rare cases ─────────────────────────────────────────────────────────── */
moatRoutes.get("/rare-cases", async (_req, res) => {
  try {
    const stats = await getRareCaseStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Rare case stats failed" });
  }
});

/* ── clinic lock-in values ──────────────────────────────────────────────── */
moatRoutes.get("/clinic-values", async (_req, res) => {
  try {
    const values = await getAllClinicValues();
    return res.json({ clinics: values, count: values.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Clinic values failed" });
  }
});

/* ── simulate encounter (demo / testing) ───────────────────────────────── */
moatRoutes.post("/simulate-encounter", async (req, res) => {
  try {
    const {
      clinicId    = "demo-clinic-001",
      complaint   = "sore throat",
      diagnosis   = "strep_pharyngitis",
      disposition = "TELEMEDICINE",
      confidence  = 0.82,
      fusionHit   = false,
      validated   = true,
    } = req.body;

    const specialty = inferSpecialty(complaint, diagnosis);
    const rarity    = await evaluateRarity(diagnosis);

    const entry = {
      encounterId:  `SIM_${Date.now()}`,
      clinicId,
      complaint,
      topDiagnosis: diagnosis,
      disposition,
      confidence,
      fusionHit,
      rareCase:     rarity.rare,
      specialty,
      validated,
      ts:           new Date().toISOString(),
    };

    await Promise.all([
      recordFlywheelEntry(entry),
      recordNetworkContribution({ clinicId, specialty, diagnosis, disposition, ts: entry.ts }),
      updateClinicValue(clinicId, {
        encounters:    1,
        diagnoses:     [diagnosis],
        specialties:   [specialty],
        goldenCases:   validated ? 1 : 0,
        rarePatterns:  rarity.rare ? 1 : 0,
      }),
    ]);

    return res.json({
      recorded:  true,
      specialty,
      rarity:    { rare: rarity.rare, label: rarity.label, boost: rarity.boost },
      message:   `Encounter recorded — ${rarity.label} diagnosis, ${specialty} specialty, ${validated ? "VALIDATED" : "unvalidated"}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Simulation failed" });
  }
});
