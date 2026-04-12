/**
 * Scope Routes — /api/scope/*
 * Agent scope management, simulation, FDA metrics, override management, drift detection
 */

import express from "express";
import { scopeEngine, MEDICAL_SCOPE_RULES }       from "../scope/agentScopeEngine";
import { delegateScope, revokeDelegate, getActiveDelegations, getAllDelegations } from "../scope/delegation";
import { detectScopeDrift, generateScopeHeatmap } from "../monitoring/scopeDrift";
import { simulateScope, runScenario }              from "../simulation/scopeSimulationEngine";
import { generateFDAMetrics }                      from "../fda/fdaValidationEngine";
import { evaluatePatientRisk, rankPatients }        from "../triage/scopeAwareTriageEngine";
import { guardAction }                             from "../execution/actionGuard";
import { getPendingOverrides, getApprovedOverrides, approveOverride, denyOverride } from "../override/overrideController";

const router = express.Router();

// ── GET /api/scope/roles — list all configured agent roles ─────────────────
router.get("/roles", (_req, res) => {
  const roles = scopeEngine.listRoles().map((role) => ({
    role,
    ...scopeEngine.getRole(role),
  }));
  res.json({ roles, count: roles.length });
});

// ── POST /api/scope/evaluate — evaluate a single action request ─────────────
router.post("/evaluate", async (req, res) => {
  try {
    const { agentRole, action, context = {} } = req.body;
    if (!agentRole || !action) { res.status(400).json({ error: "agentRole and action required" }); return; }

    const guard = await guardAction({ agentRole, action, context });
    res.json(guard);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/scope/log — scope evaluation log ──────────────────────────────
router.get("/log", (_req, res) => {
  const log   = scopeEngine.getLog().slice(-100);  // last 100 entries
  const stats = scopeEngine.getStats();
  res.json({ log, stats });
});

// ── GET /api/scope/stats — aggregate stats ─────────────────────────────────
router.get("/stats", (_req, res) => {
  res.json({ ...scopeEngine.getStats(), roles: scopeEngine.listRoles() });
});

// ── POST /api/scope/delegate — create a time-bound delegation ──────────────
router.post("/delegate", (req, res) => {
  try {
    const { fromAgent, toAgent, actions, reason, ttlMs } = req.body;
    if (!fromAgent || !toAgent || !Array.isArray(actions)) {
      res.status(400).json({ error: "fromAgent, toAgent, actions[] required" }); return;
    }
    const d = delegateScope(fromAgent, toAgent, actions, reason, ttlMs);
    res.json(d);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /api/scope/delegate/:id — revoke delegation ────────────────────
router.delete("/delegate/:id", (req, res) => {
  const ok = revokeDelegate(req.params.id);
  res.json({ revoked: ok, id: req.params.id });
});

// ── GET /api/scope/delegations — active + all delegations ─────────────────
router.get("/delegations", (_req, res) => {
  res.json({ active: getActiveDelegations(), all: getAllDelegations() });
});

// ── POST /api/scope/simulate — scope simulation (FDA validation tool) ──────
router.post("/simulate", (req, res) => {
  try {
    const { actions, overrideRules } = req.body;
    if (!Array.isArray(actions)) { res.status(400).json({ error: "actions[] required" }); return; }
    const results = simulateScope(actions, overrideRules);
    res.json({ results, summary: `${results.filter((r) => r.allowed).length}/${results.length} allowed` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/scope/scenario — run named simulation scenario ────────────────
router.post("/scenario", (req, res) => {
  try {
    const { name, actions, overrides } = req.body;
    const report = runScenario({ name: name ?? "unnamed", actions: actions ?? [], overrides });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/scope/drift — scope drift detection report ────────────────────
router.get("/drift", (_req, res) => {
  const rawLog = scopeEngine.getLog().map((e) => ({
    timestamp:           Date.now(),
    agentRole:           e.request.agentRole,
    action:              e.request.action,
    allowed:             e.decision.allowed,
    actionOutsideScope:  !e.decision.allowed && e.decision.authority === "unknown",
    requiresOverride:    e.decision.requiresOverride ?? false,
    newPermissionGranted:false,
  }));
  res.json(detectScopeDrift(rawLog));
});

// ── GET /api/scope/heatmap — scope usage heatmap per agent ─────────────────
router.get("/heatmap", (_req, res) => {
  const rawLog = scopeEngine.getLog().map((e) => ({
    timestamp:    Date.now(),
    agentRole:    e.request.agentRole,
    action:       e.request.action,
    allowed:      e.decision.allowed,
  }));
  res.json(generateScopeHeatmap(rawLog as any));
});

// ── GET /api/scope/fda — FDA validation metrics ────────────────────────────
router.get("/fda", (_req, res) => {
  res.json(generateFDAMetrics());
});

// ── POST /api/scope/triage — scope-aware patient triage ────────────────────
router.post("/triage", (req, res) => {
  try {
    const { patients } = req.body;
    if (Array.isArray(patients)) {
      res.json({ ranked: rankPatients(patients) });
    } else if (req.body.patient) {
      res.json(evaluatePatientRisk(req.body.patient));
    } else {
      res.status(400).json({ error: "patient or patients[] required" });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/scope/overrides — pending + approved overrides ────────────────
router.get("/overrides", (_req, res) => {
  res.json({ pending: getPendingOverrides(), approved: getApprovedOverrides() });
});

// ── POST /api/scope/overrides/:id/approve — physician approves override ────
router.post("/overrides/:id/approve", async (req, res) => {
  try {
    const { physicianId, note } = req.body;
    if (!physicianId) { res.status(400).json({ error: "physicianId required" }); return; }
    const approval = await approveOverride(req.params.id, physicianId, note);
    res.json(approval);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/scope/overrides/:id/deny — physician denies override ──────────
router.post("/overrides/:id/deny", async (req, res) => {
  try {
    const { physicianId, reason } = req.body;
    const denial = await denyOverride(req.params.id, physicianId ?? "physician", reason ?? "Denied");
    res.json(denial);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
