import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  runAgentCycle,
  generateSimulatedPatient,
  startLoop,
  stopLoop,
  getLoopState,
  scoreRisk,
  generateInsights,
  icuDecision,
  type PatientVitals,
} from "../agents/brainOrchestrator";
import { getAuditChainAsync, verifyPersistedChain } from "../audit/hashChain";
import { requireAuth, requireAnyRole, requireCsrf } from "../security/session";
import { createRateLimiter } from "../security/rateLimit";
import { scrubCycleForApi } from "../security/phi";

const router = Router();

const clinicalRoles = requireAnyRole(["admin", "physician", "staff"]);
const physicianOrAdmin = requireAnyRole(["admin", "physician"]);
const readLimiter = createRateLimiter({ windowMs: 60_000, max: 180, keyPrefix: "agent-brain:read" });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: "agent-brain:write" });
const loopLimiter = createRateLimiter({ windowMs: 60_000, max: 6, keyPrefix: "agent-brain:loop" });

const vitalsSchema = z.object({
  patientId: z.string().trim().min(1).max(128),
  name: z.string().trim().max(120).optional(),
  hr: z.coerce.number().min(20).max(250),
  spo2: z.coerce.number().min(50).max(100),
  temp: z.coerce.number().min(85).max(110),
  sbp: z.coerce.number().min(50).max(260),
  dbp: z.coerce.number().min(30).max(180),
  rr: z.coerce.number().min(4).max(70),
  complaint: z.string().trim().max(500).optional(),
  clinicSiteId: z.union([z.string().max(128), z.number().int()]).optional(),
  ts: z.coerce.number().optional(),
});

const cycleBodySchema = z.object({
  vitals: vitalsSchema.optional(),
  forceFleet: z.boolean().optional(),
});

const simulateBodySchema = z.object({
  vitals: vitalsSchema.optional(),
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

function summarizeHeatmapPatient(r: any, req: Request) {
  const scrubbed = scrubCycleForApi(r, req.user);
  return {
    patientRef: scrubbed.patientRef,
    patientId: scrubbed.patientId,
    riskScore: r.risk.score,
    riskLevel: r.risk.level,
    flags: r.risk.flags,
    destination: r.routing.destination,
    urgency: r.routing.urgency,
    icu: r.icu.needsICU,
    ts: r.ts,
    vitals: scrubbed.vitals,
  };
}

router.use(requireAuth, clinicalRoles);

router.get("/status", readLimiter, (_req, res) => {
  const state = getLoopState();
  res.json({
    ok: true,
    running: state.running,
    cycleCount: state.cycleCount,
    lastCycleMs: state.lastCycleMs,
    startedAt: state.startedAt,
    errors: state.errors,
    patientCount: state.recentResults.length,
  });
});

router.get("/heatmap", readLimiter, (req, res) => {
  const state = getLoopState();
  const seen = new Set<string>();
  const patients = state.recentResults
    .filter((r: any) => {
      if (seen.has(r.patientId)) return false;
      seen.add(r.patientId);
      return true;
    })
    .map((r: any) => summarizeHeatmapPatient(r, req));

  res.json({ ok: true, patients, total: patients.length });
});

router.get("/insights", readLimiter, (_req, res) => {
  const state = getLoopState();
  const priorityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, WARN: 2, INFO: 1 };
  const insights = [...state.recentInsights]
    .sort((a: any, b: any) => (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0))
    .slice(0, 50);

  res.json({ ok: true, insights, total: insights.length });
});

router.get("/cycle-results", readLimiter, (req, res) => {
  const state = getLoopState();
  const results = state.recentResults.slice(0, 10).map((r: any) => scrubCycleForApi(r, req.user));
  res.json({ ok: true, results });
});

router.get("/audit", readLimiter, asyncHandler(async (_req, res) => {
  const chain = await getAuditChainAsync(20);
  const recent = chain.slice(-20).reverse().map(e => ({
    hash: e.hash.slice(0, 12),
    prevHash: e.prevHash.slice(0, 12),
    traceId: e.traceId,
    step: e.step,
    ts: e.ts,
    createdAt: e.createdAt,
    metadata: e.metadata ? { hashVersion: e.metadata.hashVersion, source: e.metadata.source } : undefined,
  }));
  res.json({ ok: true, entries: recent, totalEvents: chain.length });
}));

router.get("/audit/verify", readLimiter, physicianOrAdmin, asyncHandler(async (_req, res) => {
  const verification = await verifyPersistedChain();
  res.json({ ok: verification.ok, ...verification });
}));

router.post("/loop/start", writeLimiter, loopLimiter, requireCsrf, physicianOrAdmin, (_req, res) => {
  const result = startLoop();
  res.json({ ok: true, ...result });
});

router.post("/loop/stop", writeLimiter, loopLimiter, requireCsrf, physicianOrAdmin, (_req, res) => {
  const result = stopLoop();
  res.json({ ok: true, ...result });
});

router.post("/cycle", writeLimiter, requireCsrf, validateBody(cycleBodySchema), asyncHandler(async (req, res) => {
  const vitals: PatientVitals = (req.body?.vitals ?? generateSimulatedPatient()) as PatientVitals;
  const result = await runAgentCycle(vitals);
  res.json({ ok: true, ...scrubCycleForApi(result, req.user) });
}));

router.post("/simulate", writeLimiter, requireCsrf, validateBody(simulateBodySchema), asyncHandler(async (req, res) => {
  const vitals: PatientVitals = (req.body?.vitals ?? generateSimulatedPatient()) as PatientVitals;
  const risk = scoreRisk(vitals);
  const icu = icuDecision(risk);
  const insights = generateInsights(vitals, risk, icu);
  res.json({ ok: true, patientRef: scrubCycleForApi({ patientId: vitals.patientId, vitals, risk, icu, insights, ts: Date.now() }, req.user).patientRef, risk, icu, insights });
}));

export default router;
