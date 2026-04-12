/**
 * Scope Claims + Creep Auditor + Hook Engine routes — /api/scope/*
 */
import express from "express";
import {
  scopeClaimsEngine, CLAIM_CATALOG,
  type ClaimCheckInput,
} from "../scope/agentScopeClaims";
import {
  recordUsage, generateCreepReport, generateAllCreepReports,
  getExpansionEvents, getCriticalExpansions, getUsageRecords,
} from "../scope/scopeCreepAuditor";
import {
  listHooks,
  createPermissionRequest, approvePermissionRequest, denyPermissionRequest,
  getPermissionStatus, getPendingRequests,
  firePreToolUse,
  type PreToolUsePayload,
} from "../agent/agentHookEngine";

const router = express.Router();

// ── Scope Claims ──────────────────────────────────────────────────────────────

router.get("/claims/catalog", (_req, res) => {
  res.json({ count: CLAIM_CATALOG.length, claims: CLAIM_CATALOG });
});

router.get("/claims/grants", (req, res) => {
  const { agentRole } = req.query;
  const grants = agentRole
    ? scopeClaimsEngine.getGrants(agentRole as string)
    : scopeClaimsEngine.getAllGrants();
  res.json({ count: grants.length, grants });
});

router.post("/claims/check", (req, res) => {
  const input: ClaimCheckInput = req.body;
  if (!input.agentRole || !input.action) {
    res.status(400).json({ error: "agentRole and action required" }); return;
  }
  const result = scopeClaimsEngine.check(input);
  res.json(result);
});

router.post("/claims/grants/issue", (req, res) => {
  try {
    const grant = scopeClaimsEngine.issueGrant(req.body);
    res.json(grant);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete("/claims/grants/:grantId", (req, res) => {
  const ok = scopeClaimsEngine.revokeGrant(req.params.grantId);
  res.json({ revoked: ok });
});

// ── Scope Creep Auditor ───────────────────────────────────────────────────────

router.post("/creep/record", (req, res) => {
  const { sessionId, agentRole, action, outcome, context } = req.body;
  if (!sessionId || !agentRole || !action || !outcome) {
    res.status(400).json({ error: "sessionId, agentRole, action, outcome required" }); return;
  }
  recordUsage(sessionId, agentRole, action, outcome, context);
  res.json({ ok: true });
});

router.get("/creep/report/:agentRole", (req, res) => {
  const report = generateCreepReport(req.params.agentRole);
  if (!report) { res.status(404).json({ error: "Agent role not found in scope rules" }); return; }
  res.json(report);
});

router.get("/creep/reports", (_req, res) => {
  res.json({ reports: generateAllCreepReports() });
});

router.get("/creep/expansions", (req, res) => {
  const limit = req.query.critical === "true"
    ? undefined
    : Number(req.query.limit ?? 50);
  const events = req.query.critical === "true"
    ? getCriticalExpansions()
    : getExpansionEvents(limit);
  res.json({ count: events.length, events });
});

router.get("/creep/usage", (req, res) => {
  const { sessionId, agentRole, limit } = req.query;
  const records = getUsageRecords({
    sessionId: sessionId as string,
    agentRole: agentRole as string,
    limit:     limit ? Number(limit) : 100,
  });
  res.json({ count: records.length, records });
});

// ── Hook Engine ───────────────────────────────────────────────────────────────

router.get("/hooks", (_req, res) => {
  res.json({ count: listHooks().length, hooks: listHooks() });
});

router.post("/hooks/pre-tool-use/evaluate", async (req, res) => {
  try {
    const payload: PreToolUsePayload = req.body;
    if (!payload.sessionId || !payload.toolName) {
      res.status(400).json({ error: "sessionId and toolName required" }); return;
    }
    const result = await firePreToolUse(payload);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/hooks/permission/create", (req, res) => {
  const { sessionId, agentRole, toolName, input, reason, ttlSeconds } = req.body;
  if (!sessionId || !agentRole || !toolName || !reason) {
    res.status(400).json({ error: "sessionId, agentRole, toolName, reason required" }); return;
  }
  const requestId = createPermissionRequest(sessionId, agentRole, toolName, input ?? {}, reason, ttlSeconds ?? 300);
  res.json({ requestId });
});

router.get("/hooks/permission/pending", (_req, res) => {
  res.json({ count: getPendingRequests().length, requests: getPendingRequests() });
});

router.get("/hooks/permission/:requestId", (req, res) => {
  const status = getPermissionStatus(req.params.requestId);
  if (!status) { res.status(404).json({ error: "Request not found" }); return; }
  res.json(status);
});

router.post("/hooks/permission/:requestId/approve", (req, res) => {
  const { approvedBy, notes } = req.body;
  const ok = approvePermissionRequest(req.params.requestId, approvedBy ?? "physician", notes);
  res.json({ approved: ok });
});

router.post("/hooks/permission/:requestId/deny", (req, res) => {
  const ok = denyPermissionRequest(req.params.requestId, req.body.reason);
  res.json({ denied: ok });
});

export default router;
