import { Router } from "express";
import { requireAuth } from "../security/session";
import { requireRole } from "../middleware/requireRole";
import { requireCsrf } from "../security/session";
import { z } from "zod";
import { db } from "../db";
import { labPanels, ventilatorSnapshots, sofaScores, bayesianTrajectoryRecords } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { calculateSofa, computePfRatio, type SofaInputs } from "../labs/sofaCalculator";
import { runBayesianTrajectory, type VitalObservation } from "../labs/bayesianTrajectory";
import { runLabGoldenCaseValidation } from "../labs/goldenCaseValidator";
import { appendAuditEvent } from "../audit/hashChain";
import { randomUUID } from "crypto";
import type { UserRole } from "../types/auth";

export const labRouter = Router();

const CLINICAL_ROLES: UserRole[] = ["admin", "physician", "staff"];

// ── Lab panel ingestion ───────────────────────────────────────────────────────

const ingestLabSchema = z.object({
  encounterId:       z.number().int().positive().optional(),
  clinicEncounterId: z.number().int().positive().optional(),
  panelType:         z.enum(["CBC", "CMP", "ABG", "MIXED"]),
  collectedAt:       z.string().datetime(),
  // CBC
  wbc: z.number().min(0).max(200).optional(),
  rbc: z.number().min(0).max(15).optional(),
  hgb: z.number().min(0).max(25).optional(),
  hct: z.number().min(0).max(100).optional(),
  plt: z.number().min(0).max(3000).optional(),
  neutPct: z.number().min(0).max(100).optional(),
  bandPct: z.number().min(0).max(100).optional(),
  // CMP
  sodium:        z.number().min(80).max(180).optional(),
  potassium:     z.number().min(1).max(10).optional(),
  chloride:      z.number().min(60).max(140).optional(),
  bicarbonate:   z.number().min(5).max(50).optional(),
  bun:           z.number().min(0).max(300).optional(),
  creatinine:    z.number().min(0).max(30).optional(),
  glucose:       z.number().min(20).max(1500).optional(),
  calcium:       z.number().min(4).max(20).optional(),
  albumin:       z.number().min(0).max(10).optional(),
  totalBilirubin:z.number().min(0).max(50).optional(),
  alt:           z.number().min(0).max(10000).optional(),
  ast:           z.number().min(0).max(10000).optional(),
  // ABG
  ph:          z.number().min(6.5).max(8.0).optional(),
  pco2:        z.number().min(5).max(150).optional(),
  po2:         z.number().min(20).max(600).optional(),
  hco3:        z.number().min(5).max(60).optional(),
  baseExcess:  z.number().min(-30).max(30).optional(),
  sao2:        z.number().min(0).max(100).optional(),
  lactate:     z.number().min(0).max(30).optional(),
  fio2:        z.number().min(0.21).max(1.0).optional(),
  // Extras
  procalcitonin: z.number().min(0).max(1000).optional(),
  crp:           z.number().min(0).max(1000).optional(),
  inrPt:         z.number().min(0.5).max(20).optional(),
  notes:         z.string().max(2000).optional(),
});

labRouter.post(
  "/ingest",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  requireCsrf,
  async (req, res) => {
    const parsed = ingestLabSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const [row] = await db.insert(labPanels).values({
      ...data,
      collectedAt: new Date(data.collectedAt),
      createdBy: req.user?.userId,
    }).returning();

    await appendAuditEvent({
      traceId: randomUUID(),
      step: "lab_panel_ingested",
      input:  { panelType: data.panelType, encounterId: data.encounterId },
      output: { labPanelId: row.id },
      metadata: { userId: req.user?.userId },
    });

    res.json({ ok: true, labPanel: row });
  }
);

// ── Get labs for an encounter ─────────────────────────────────────────────────

labRouter.get(
  "/encounter/:encounterId",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  async (req, res) => {
    const encId = parseInt(req.params.encounterId, 10);
    if (isNaN(encId)) { res.status(400).json({ ok: false, error: "Invalid encounter ID" }); return; }
    const rows = await db.select().from(labPanels)
      .where(eq(labPanels.encounterId, encId))
      .orderBy(desc(labPanels.collectedAt));
    res.json({ ok: true, labs: rows });
  }
);

// ── Ventilator snapshot ingestion ─────────────────────────────────────────────

const ventSnapshotSchema = z.object({
  encounterId:        z.number().int().positive().optional(),
  clinicEncounterId:  z.number().int().positive().optional(),
  recordedAt:         z.string().datetime(),
  mode:               z.enum(["AC/VC", "SIMV", "PSV", "CPAP", "BiPAP", "HFNC"]).optional(),
  fiO2:               z.number().min(0.21).max(1.0).optional(),
  peep:               z.number().min(0).max(30).optional(),
  tidalVolume:        z.number().min(0).max(1500).optional(),
  setRate:            z.number().min(0).max(60).optional(),
  peakPressure:       z.number().min(0).max(80).optional(),
  plateauPressure:    z.number().min(0).max(60).optional(),
  meanAirwayPressure: z.number().min(0).max(40).optional(),
  dynamicCompliance:  z.number().min(0).max(200).optional(),
  resistance:         z.number().min(0).max(50).optional(),
  minuteVentilation:  z.number().min(0).max(30).optional(),
  pvLoopPoints:       z.array(z.object({ v: z.number(), p: z.number() })).optional(),
});

labRouter.post(
  "/ventilator",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  requireCsrf,
  async (req, res) => {
    const parsed = ventSnapshotSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.flatten() }); return; }
    const data = parsed.data;

    let pfRatio: number | null = null;
    let drivingPressure: number | null = null;
    if (data.fiO2 && data.peep !== undefined && data.plateauPressure !== undefined) {
      drivingPressure = data.plateauPressure - data.peep;
    }

    const [row] = await db.insert(ventilatorSnapshots).values({
      ...data,
      recordedAt:     new Date(data.recordedAt),
      pvLoopPoints:   data.pvLoopPoints ?? null,
      pfRatio,
      drivingPressure,
    }).returning();
    res.json({ ok: true, snapshot: row });
  }
);

labRouter.get(
  "/ventilator/encounter/:encounterId",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  async (req, res) => {
    const encId = parseInt(req.params.encounterId, 10);
    if (isNaN(encId)) { res.status(400).json({ ok: false, error: "Invalid encounter ID" }); return; }
    const rows = await db.select().from(ventilatorSnapshots)
      .where(eq(ventilatorSnapshots.encounterId, encId))
      .orderBy(desc(ventilatorSnapshots.recordedAt));
    res.json({ ok: true, snapshots: rows });
  }
);

// ── SOFA score calculation and persistence ────────────────────────────────────

const sofaInputSchema = z.object({
  encounterId:         z.number().int().positive().optional(),
  clinicEncounterId:   z.number().int().positive().optional(),
  scoredAt:            z.string().datetime(),
  paO2:                z.number().min(20).max(600).optional(),
  fiO2:                z.number().min(0.21).max(1.0).optional(),
  mechanicallyVentilated: z.boolean().optional(),
  platelets:           z.number().min(0).max(3000).optional(),
  bilirubin:           z.number().min(0).max(50).optional(),
  map:                 z.number().min(0).max(200).optional(),
  dobutamineDose:      z.number().min(0).max(50).optional(),
  dopamineDose:        z.number().min(0).max(50).optional(),
  epinephrineDose:     z.number().min(0).max(5).optional(),
  norepinephrineDose:  z.number().min(0).max(5).optional(),
  gcs:                 z.number().int().min(3).max(15).optional(),
  creatinine:          z.number().min(0).max(30).optional(),
  urineOutput24h:      z.number().min(0).max(10000).optional(),
});

labRouter.post(
  "/sofa/calculate",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  requireCsrf,
  async (req, res) => {
    const parsed = sofaInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.flatten() }); return; }
    const data = parsed.data;

    const sofaResult = calculateSofa(data as SofaInputs);
    const pfRatio = computePfRatio(data.paO2, data.fiO2);

    let delta: number | null = null;
    if (data.encounterId) {
      const [prior] = await db.select().from(sofaScores)
        .where(eq(sofaScores.encounterId, data.encounterId))
        .orderBy(desc(sofaScores.scoredAt))
        .limit(1);
      if (prior) delta = sofaResult.total - prior.totalScore;
    }

    const [row] = await db.insert(sofaScores).values({
      encounterId:         data.encounterId ?? null,
      clinicEncounterId:   data.clinicEncounterId ?? null,
      scoredAt:            new Date(data.scoredAt),
      respiratoryScore:    sofaResult.components.respiratory,
      coagulationScore:    sofaResult.components.coagulation,
      liverScore:          sofaResult.components.liver,
      cardiovascularScore: sofaResult.components.cardiovascular,
      cnsScore:            sofaResult.components.cns,
      renalScore:          sofaResult.components.renal,
      totalScore:          sofaResult.total,
      delta:               delta ?? null,
      interpretation:      sofaResult.interpretation,
      pfRatio:             pfRatio ?? null,
    }).returning();

    await appendAuditEvent({
      traceId: randomUUID(),
      step: "sofa_score_computed",
      input:  { encounterId: data.encounterId },
      output: { total: sofaResult.total, interpretation: sofaResult.interpretation, delta },
      metadata: { flags: sofaResult.flags, userId: req.user?.userId },
    });

    res.json({ ok: true, sofa: sofaResult, delta, record: row });
  }
);

labRouter.get(
  "/sofa/delta/:encounterId",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  async (req, res) => {
    const encId = parseInt(req.params.encounterId, 10);
    if (isNaN(encId)) { res.status(400).json({ ok: false, error: "Invalid encounter ID" }); return; }
    const rows = await db.select().from(sofaScores)
      .where(eq(sofaScores.encounterId, encId))
      .orderBy(desc(sofaScores.scoredAt));
    res.json({ ok: true, sofaHistory: rows });
  }
);

// ── Bayesian trajectory ───────────────────────────────────────────────────────

const bayesianSchema = z.object({
  encounterId: z.number().int().positive().optional(),
  vitals: z.array(z.object({
    timestamp:  z.string().datetime(),
    hr:         z.number().optional(),
    spo2:       z.number().optional(),
    sbp:        z.number().optional(),
    dbp:        z.number().optional(),
    temp:       z.number().optional(),
    rr:         z.number().optional(),
    gcs:        z.number().optional(),
    sofaScore:  z.number().optional(),
  })).max(200),
  priorAlpha: z.number().min(0.1).max(100).optional(),
  priorBeta:  z.number().min(0.1).max(100).optional(),
});

labRouter.post(
  "/trajectory/bayesian",
  requireAuth,
  requireRole(CLINICAL_ROLES),
  requireCsrf,
  async (req, res) => {
    const parsed = bayesianSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.flatten() }); return; }
    const data = parsed.data;

    const vitals: VitalObservation[] = data.vitals.map(v => ({
      ...v,
      timestamp: new Date(v.timestamp),
    }));

    let labs: typeof labPanels.$inferSelect[] = [];
    let sofaHistory: Array<{ scoredAt: Date; totalScore: number }> = [];

    if (data.encounterId) {
      labs = await db.select().from(labPanels)
        .where(eq(labPanels.encounterId, data.encounterId))
        .orderBy(desc(labPanels.collectedAt));
      const sofaRows = await db.select().from(sofaScores)
        .where(eq(sofaScores.encounterId, data.encounterId))
        .orderBy(desc(sofaScores.scoredAt));
      sofaHistory = sofaRows.map(r => ({ scoredAt: r.scoredAt, totalScore: r.totalScore }));
    }

    const result = runBayesianTrajectory({
      vitals,
      labs,
      sofaHistory,
      priorAlpha: data.priorAlpha,
      priorBeta:  data.priorBeta,
    });

    if (data.encounterId) {
      await db.insert(bayesianTrajectoryRecords).values({
        encounterId:   data.encounterId,
        computedAt:    new Date(),
        priorMean:     (data.priorAlpha ?? 1) / ((data.priorAlpha ?? 1) + (data.priorBeta ?? 4)),
        posteriorMean: result.state.mean,
        posteriorLower: result.state.lower95,
        posteriorUpper: result.state.upper95,
        observations:  result.observations,
        trend:         result.trend,
        horizonRisk:   result.horizonRisk,
        sofaDelta:     result.sofaDelta ?? null,
        flags:         result.flags,
      });
    }

    res.json({ ok: true, trajectory: result });
  }
);

// ── Golden case validation ────────────────────────────────────────────────────

const ADMIN_PHYSICIAN: UserRole[] = ["admin", "physician"];

labRouter.post(
  "/golden-cases/validate",
  requireAuth,
  requireRole(ADMIN_PHYSICIAN),
  requireCsrf,
  async (_req, res) => {
    const result = await runLabGoldenCaseValidation();
    res.status(result.passed ? 200 : 422).json({ ok: result.passed, validation: result });
  }
);

labRouter.get(
  "/golden-cases/validate",
  requireAuth,
  requireRole(ADMIN_PHYSICIAN),
  async (_req, res) => {
    const result = await runLabGoldenCaseValidation();
    res.status(result.passed ? 200 : 422).json({ ok: result.passed, validation: result });
  }
);
