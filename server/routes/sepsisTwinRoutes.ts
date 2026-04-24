/**
 * server/routes/sepsisTwinRoutes.ts
 *
 * Sepsis Twin REST API
 *
 * POST /api/sepsis-twin/analyze     — full sepsis analysis (twin + gate)
 * POST /api/sepsis-twin/simulate    — raw twin simulation only
 * POST /api/sepsis-twin/compare     — baseline vs intervention comparison
 * POST /api/sepsis-twin/sofa        — SOFA score only (no twin simulation)
 * GET  /api/sepsis-twin/demo        — demo patient (high-risk sepsis scenario)
 */

import { Router, type Request, type Response } from "express";
import { runWithSepsis }      from "../agents/orchestrator";
import { simulateTwinV2 }     from "../twin/twinV2";
import { compareScenarios }   from "../twin/interventions";
import { computeSOFA }        from "../physiology/sofa";
import { sepsisProbability }  from "../physiology/sepsis";
import { shockScore }         from "../physiology/hemodynamics";
import { respRisk }           from "../physiology/respiratory";
import type { TwinState }     from "../twin/twinV2";

const router = Router();

// ── Demo patient (high-risk sepsis presentation) ──────────────────────────────
const DEMO_PATIENT: TwinState = {
  t:           0,
  hr:          120,
  rr:          24,
  temp:        101.5,
  map:         60,
  spo2:        88,
  lactate:     3.2,
  onVent:      false,
  vasopressors: false,
  labs: {
    platelets:  90,
    bilirubin:  2.5,
    creatinine: 2.2,
    gcs:        13,
  },
};

// ── GET /api/sepsis-twin/demo ─────────────────────────────────────────────────
router.get("/demo", (_req: Request, res: Response) => {
  res.json({ ok: true, patient: DEMO_PATIENT });
});

// ── POST /api/sepsis-twin/analyze ─────────────────────────────────────────────
/**
 * Full sepsis analysis: digital twin (8 steps) + safety gate.
 * Body: TwinState patient object (or empty → uses demo patient).
 */
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const patient = req.body && Object.keys(req.body).length > 0
      ? { ...DEMO_PATIENT, ...req.body }
      : DEMO_PATIENT;

    const result = await runWithSepsis(patient);

    res.json({
      ok:     true,
      sepsis: result.sepsis,
      gate:   result.gate,
    });
  } catch (err: any) {
    console.error("[sepsis-twin/analyze]", err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? "Analysis failed" });
  }
});

// ── POST /api/sepsis-twin/simulate ────────────────────────────────────────────
/**
 * Raw twin simulation — no safety gate.
 * Body: { patient?: TwinState, steps?: number }
 */
router.post("/simulate", (req: Request, res: Response) => {
  try {
    const patient = req.body?.patient ?? DEMO_PATIENT;
    const steps   = Math.min(48, Math.max(1, parseInt(req.body?.steps) || 12));
    const merged  = { ...DEMO_PATIENT, ...patient };

    const trajectory = simulateTwinV2(merged, steps);
    const last       = trajectory[trajectory.length - 1];

    res.json({
      ok:         true,
      steps,
      trajectory,
      summary: {
        finalSOFA:       last.sofa,
        finalSepsisProb: last.sepsisProb,
        finalShock:      last.shock,
        finalResp:       last.resp,
        trend: {
          sofaDelta:  (last.sofa ?? 0) - (trajectory[0].sofa ?? 0),
          probDelta:  (last.sepsisProb ?? 0) - (trajectory[0].sepsisProb ?? 0),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Simulation failed" });
  }
});

// ── POST /api/sepsis-twin/compare ─────────────────────────────────────────────
/**
 * Baseline vs fluids+O2+pressors comparison.
 * Body: { patient?: TwinState }
 */
router.post("/compare", (req: Request, res: Response) => {
  try {
    const patient = { ...DEMO_PATIENT, ...(req.body?.patient ?? {}) };
    const { baseline, intervention } = compareScenarios(patient);

    const lastBase  = baseline[baseline.length - 1];
    const lastIntvn = intervention[intervention.length - 1];

    res.json({
      ok: true,
      baseline,
      intervention,
      delta: {
        sofaDiff:       (lastBase.sofa       ?? 0) - (lastIntvn.sofa       ?? 0),
        sepsisRiskDiff: (lastBase.sepsisProb ?? 0) - (lastIntvn.sepsisProb ?? 0),
        shockDiff:      (lastBase.shock      ?? 0) - (lastIntvn.shock      ?? 0),
        mapDiff:        (lastIntvn.map       ?? 0) - (lastBase.map         ?? 0),
      },
      recommendation: (lastBase.sepsisProb ?? 0) - (lastIntvn.sepsisProb ?? 0) > 0.15
        ? "Intervention significantly reduces sepsis probability — discuss with physician"
        : "Modest benefit expected — individualise clinical plan",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Comparison failed" });
  }
});

// ── POST /api/sepsis-twin/sofa ────────────────────────────────────────────────
/**
 * SOFA score only — fast, no simulation.
 * Body: { vitals: Vitals, labs: Labs }
 */
router.post("/sofa", (req: Request, res: Response) => {
  try {
    const vitals = req.body?.vitals ?? {};
    const labs   = req.body?.labs   ?? {};

    const result = computeSOFA(vitals, labs);

    const sofa    = result.total;
    const sepsisP = sepsisProbability({
      sofa,
      lactate: vitals.lactate,
      map:     vitals.map,
      temp:    vitals.temp,
      hr:      vitals.hr,
      rr:      vitals.rr,
    });
    const shock   = shockScore({ map: vitals.map, lactate: vitals.lactate, vasopressors: vitals.vasopressors });
    const resp    = respRisk(vitals.spo2, vitals.onVent);

    const interpretation =
      sofa >= 11 ? "SOFA ≥ 11 — Very high mortality risk (>80%)" :
      sofa >= 7  ? "SOFA 7-10 — High mortality risk (>50%)" :
      sofa >= 3  ? "SOFA 3-6 — Significant organ dysfunction" :
      sofa >= 1  ? "SOFA 1-2 — Mild organ dysfunction — monitor closely" :
                   "SOFA 0 — No organ dysfunction detected";

    res.json({
      ok: true,
      sofa: result.total,
      components: result.components,
      sepsisProb: Math.round(sepsisP * 1000) / 1000,
      shock:      Math.round(shock   * 1000) / 1000,
      resp:       Math.round(resp    * 1000) / 1000,
      interpretation,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "SOFA calculation failed" });
  }
});

export default router;
