/**
 * server/routes/agentBrainRoutes.ts
 * Agent Brain API — unified endpoint for the autonomous multi-agent system
 */

import { Router } from "express";
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
import { getAuditChain } from "../audit/hashChain";

const router = Router();

// ── GET /api/agent-brain/status ───────────────────────────────────────────────

router.get("/status", (_req, res) => {
  const state = getLoopState();
  res.json({
    ok: true,
    running:     state.running,
    cycleCount:  state.cycleCount,
    lastCycleMs: state.lastCycleMs,
    startedAt:   state.startedAt,
    errors:      state.errors,
    patientCount: state.recentResults.length,
  });
});

// ── GET /api/agent-brain/heatmap ──────────────────────────────────────────────

router.get("/heatmap", (_req, res) => {
  const state = getLoopState();

  // Deduplicate by patientId — keep the most recent result per patient
  const seen = new Set<string>();
  const patients = state.recentResults
    .filter(r => { if (seen.has(r.patientId)) return false; seen.add(r.patientId); return true; })
    .map(r => ({
      patientId:   r.patientId,
      name:        r.vitals.name,
      riskScore:   r.risk.score,
      riskLevel:   r.risk.level,
      flags:       r.risk.flags,
      destination: r.routing.destination,
      urgency:     r.routing.urgency,
      icu:         r.icu.needsICU,
      ts:          r.ts,
      vitals: {
        hr:   r.vitals.hr,
        spo2: r.vitals.spo2,
        temp: r.vitals.temp,
        sbp:  r.vitals.sbp,
        rr:   r.vitals.rr,
      },
    }));

  res.json({ ok: true, patients, total: patients.length });
});

// ── GET /api/agent-brain/insights ─────────────────────────────────────────────

router.get("/insights", (_req, res) => {
  const state = getLoopState();
  res.json({
    ok: true,
    insights: state.recentInsights.slice(0, 30),
    critical: state.recentInsights.filter(i => i.priority === "CRITICAL").length,
    high:     state.recentInsights.filter(i => i.priority === "HIGH").length,
  });
});

// ── GET /api/agent-brain/cycle-results ────────────────────────────────────────

router.get("/cycle-results", (_req, res) => {
  const state = getLoopState();
  res.json({
    ok: true,
    results: state.recentResults.slice(0, 10).map(r => ({
      patientId:  r.patientId,
      name:       r.vitals.name,
      riskLevel:  r.risk.level,
      riskScore:  r.risk.score,
      urgency:    r.icu.urgency,
      destination: r.routing.destination,
      auditHash:  r.auditHash.slice(0, 12),
      durationMs: r.durationMs,
      ts:         r.ts,
    })),
  });
});

// ── GET /api/agent-brain/audit ────────────────────────────────────────────────

router.get("/audit", (_req, res) => {
  const chain = getAuditChain();
  const recent = chain.slice(-20).reverse().map(e => ({
    hash:       e.hash.slice(0, 12),
    prevHash:   e.prevHash.slice(0, 12),
    patientId:  e.patientId,
    risk:       e.risk,
    ts:         e.ts,
  }));
  res.json({ ok: true, entries: recent, totalEvents: chain.length });
});

// ── POST /api/agent-brain/loop/start ─────────────────────────────────────────

router.post("/loop/start", (_req, res) => {
  const result = startLoop();
  res.json({ ok: true, ...result });
});

// ── POST /api/agent-brain/loop/stop ──────────────────────────────────────────

router.post("/loop/stop", (_req, res) => {
  const result = stopLoop();
  res.json({ ok: true, ...result });
});

// ── POST /api/agent-brain/cycle — run one manual cycle ───────────────────────

router.post("/cycle", async (req, res) => {
  try {
    const vitals: PatientVitals = req.body?.vitals ?? generateSimulatedPatient();
    const result = await runAgentCycle(vitals);
    res.json({
      ok:         true,
      patientId:  result.patientId,
      risk:       result.risk,
      icu:        result.icu,
      safety:     result.safety,
      twin:       result.twin,
      routing:    result.routing,
      insights:   result.insights,
      auditHash:  result.auditHash,
      durationMs: result.durationMs,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── POST /api/agent-brain/simulate — run twin simulation ─────────────────────

router.post("/simulate", async (req, res) => {
  try {
    const vitals: PatientVitals = req.body?.vitals ?? generateSimulatedPatient();
    const risk    = scoreRisk(vitals);
    const icu     = icuDecision(risk);
    const insights = generateInsights(vitals, risk, icu);
    const { runDigitalTwin } = await import("../simulation/digitalTwinEngine");
    const twin = runDigitalTwin({ result: { trajectory: { riskScore: risk.score } } });
    res.json({ ok: true, vitals, risk, icu, twin, insights });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
