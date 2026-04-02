import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  getAgentStatus,
  getCoordinatorStats,
  runAgent,
  disableAgent,
  enableAgent,
} from "../agents/agentCoordinator";
import { getAllTaskAgents } from "../agents/taskAgentRegistry";
import { getAgents as getGovernanceAgents } from "../governance/agentRegistry";
import { getAgentLog, getAgentStats } from "../agents/tracking";
import { getAgentMetrics } from "../agents/orchestrator";
import { SKILL_REGISTRY } from "../skills/registry/skillRegistry";
import { getSkills, getAllCaseTraces } from "../monitoring/healthRegistry";
import { proposeEvolution, getLastProposal } from "../evolution/evolutionEngine";

const router = Router();

router.use(requireRole(["admin", "physician"]));

/* ── runtime skill-disable overlay ─────────────────────────── */
const disabledSkillIds = new Set<string>();

/* ── AGENTS ─────────────────────────────────────────────────── */

router.get("/agents", (_req, res) => {
  const coordinator = getAgentStatus().map((a) => ({
    source: "coordinator",
    name: a.name,
    description: a.description,
    layer: a.layer,
    status: a.status,
    runCount: a.runCount,
    errorCount: a.errorCount,
    avgDurationMs: a.avgDurationMs,
    lastRun: a.lastRun,
    lastError: a.lastError,
    lastResult: a.lastResult,
  }));

  const taskAgents = getAllTaskAgents().map((a) => ({
    source: "task",
    name: a.name,
    description: null,
    layer: "task",
    status: a.status,
    runCount: null,
    errorCount: null,
    avgDurationMs: null,
    lastRun: a.lastRun ? new Date(a.lastRun).toISOString() : null,
    lastError: null,
    lastResult: null,
  }));

  const governance = getGovernanceAgents().map((a) => ({
    source: "governance",
    name: a.id,
    description: a.role,
    layer: "governance",
    status: a.health === "healthy" ? "healthy" : a.health === "warning" ? "error" : "error",
    runCount: null,
    errorCount: null,
    avgDurationMs: null,
    lastRun: a.lastSeenAt,
    lastError: null,
    lastResult: a.lastAction,
  }));

  let orchestratorMetrics: Record<string, any> = {};
  try {
    orchestratorMetrics = getAgentMetrics();
  } catch {
    orchestratorMetrics = {};
  }

  const trackingStats = getAgentStats();

  const allAgents = [...coordinator, ...taskAgents, ...governance].map((a) => ({
    ...a,
    orchestratorMetrics: orchestratorMetrics[a.name] ?? null,
    trackingStats: trackingStats[a.name] ?? null,
  }));

  const stats = getCoordinatorStats();

  res.json({
    summary: {
      total: allAgents.length,
      coordinator: coordinator.length,
      task: taskAgents.length,
      governance: governance.length,
      healthy: allAgents.filter((a) => a.status === "healthy" || a.status === "idle").length,
      error: allAgents.filter((a) => a.status === "error").length,
      disabled: allAgents.filter((a) => a.status === "disabled").length,
    },
    coordinatorStats: stats,
    agents: allAgents,
  });
});

router.post("/agents/:name/run", async (req, res) => {
  const { name } = req.params;
  try {
    const result = await runAgent(name);
    res.json({ ok: true, name, ...result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/agents/:name/enable", (req, res) => {
  const { name } = req.params;
  const ok = enableAgent(name);
  res.json({ ok, name, action: "enabled" });
});

router.post("/agents/:name/disable", (req, res) => {
  const { name } = req.params;
  const ok = disableAgent(name);
  res.json({ ok, name, action: "disabled" });
});

/* ── SKILLS ──────────────────────────────────────────────────── */

router.get("/skills", (_req, res) => {
  const healthMap = new Map(getSkills().map((s) => [s.name, s]));

  const skills = SKILL_REGISTRY.map((sk) => {
    const health = healthMap.get(sk.skillName) ?? null;
    return {
      skillId: sk.skillId,
      skillName: sk.skillName,
      category: sk.category,
      description: sk.description,
      engineType: sk.engineType,
      safetyClass: sk.safetyClass,
      triggerType: sk.triggerType,
      version: sk.version,
      productModule: sk.productModule,
      strategicNotes: sk.strategicNotes ?? null,
      enabled: sk.enabled && !disabledSkillIds.has(sk.skillId),
      runtimeDisabled: disabledSkillIds.has(sk.skillId),
      health: health
        ? {
            status: health.status,
            successCount: health.successCount,
            failureCount: health.failureCount,
            avgLatencyMs: health.avgLatencyMs ?? null,
            lastCalled: health.lastCalled ? new Date(health.lastCalled).toISOString() : null,
            lastError: health.lastError ?? null,
          }
        : null,
    };
  });

  const byCategory = skills.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  res.json({
    summary: {
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      disabled: skills.filter((s) => !s.enabled).length,
      critical: skills.filter((s) => s.safetyClass === "critical").length,
      byCategory,
    },
    skills,
  });
});

router.post("/skills/:id/toggle", (req, res) => {
  const { id } = req.params;
  const skill = SKILL_REGISTRY.find((s) => s.skillId === id);
  if (!skill) return res.status(404).json({ ok: false, error: "Skill not found" });
  if (disabledSkillIds.has(id)) {
    disabledSkillIds.delete(id);
    return res.json({ ok: true, skillId: id, skillName: skill.skillName, enabled: true });
  } else {
    disabledSkillIds.add(id);
    return res.json({ ok: true, skillId: id, skillName: skill.skillName, enabled: false });
  }
});

/* ── LAYERS (SL3–SL8) ────────────────────────────────────────── */

const LAYER_DESCRIPTORS = [
  {
    layer: "SL3",
    name: "Outcome Feedback",
    description: "Captures patient outcomes and triggers feedback loops for triage improvement",
    endpoint: "/api/sl3/*",
    module: "outcomeStore",
    primaryFile: "server/sl3/outcomeStore.ts",
  },
  {
    layer: "SL4",
    name: "Provider Analytics",
    description: "Monitors clinician performance, efficiency, and diagnostic accuracy",
    endpoint: "/api/sl4/*",
    module: "providerPerformanceService",
    primaryFile: "server/sl4/providerPerformanceService.ts",
  },
  {
    layer: "SL5",
    name: "Population Health",
    description: "Tracks disease trends, disposition distributions, and clinical drift",
    endpoint: "/api/sl5/*",
    module: "populationHealthService",
    primaryFile: "server/sl5/populationHealthService.ts",
  },
  {
    layer: "SL6",
    name: "Clinical Coding",
    description: "Maps clinical encounters to ICD-10/CPT codes for billing and analytics",
    endpoint: "/api/sl6/*",
    module: "icd10Mapper",
    primaryFile: "server/sl6/icd10Mapper.ts",
  },
  {
    layer: "SL7",
    name: "Comm Hub",
    description: "Manages multi-channel patient messaging — WhatsApp, Telegram, email templates",
    endpoint: "/api/sl7/*",
    module: "messageTemplateService",
    primaryFile: "server/sl7/messageTemplateService.ts",
  },
  {
    layer: "SL8",
    name: "Tenant Orchestration",
    description: "Multi-tenant clinic configurations, feature gating, and site-level scaling",
    endpoint: "/api/sl8/*",
    module: "tenantOrchestratorService",
    primaryFile: "server/sl8/tenantOrchestratorService.ts",
  },
];

router.get("/layers", async (_req, res) => {
  const layers = await Promise.all(
    LAYER_DESCRIPTORS.map(async (ld) => {
      let stats: any = null;
      try {
        if (ld.layer === "SL3") {
          const { listOutcomes } = await import("../sl3/outcomeStore");
          const outcomes = await listOutcomes();
          stats = { totalOutcomes: outcomes.length };
        } else if (ld.layer === "SL4") {
          const { listProviders, getProviderSummary } = await import("../sl4/providerPerformanceService");
          const providers = listProviders();
          const summary = getProviderSummary();
          stats = { providers: providers.length, summary };
        } else if (ld.layer === "SL5") {
          const { getComplaintTrends, getDispositionDistribution, getDriftAlerts } = await import("../sl5/populationHealthService");
          const trends = getComplaintTrends();
          const drift = getDriftAlerts();
          stats = { complaints: Object.keys(trends).length, driftAlerts: drift.length };
        } else if (ld.layer === "SL6") {
          stats = { mapper: "icd10/cpt active", note: "coding engine live" };
        } else if (ld.layer === "SL7") {
          const { listTemplates, getDeliveryStats } = await import("../sl7/messageTemplateService");
          const templates = await listTemplates();
          const deliveryStats = await getDeliveryStats();
          stats = { templates: templates.length, delivery: deliveryStats };
        } else if (ld.layer === "SL8") {
          const { listTenants, getTenantSummary } = await import("../sl8/tenantOrchestratorService");
          const tenants = await listTenants();
          const summary = await getTenantSummary();
          stats = { tenants: tenants.length, summary };
        }
      } catch {
        stats = null;
      }
      return { ...ld, status: "active", stats };
    })
  );

  res.json({ layers });
});

/* ── EVOLUTION ───────────────────────────────────────────────── */

router.get("/evolution", (_req, res) => {
  const last = getLastProposal();
  const coordinatorStats = getCoordinatorStats();
  res.json({
    proposal: last.proposal,
    analyzedAt: last.analyzedAt,
    systemContext: {
      totalAgents: coordinatorStats.total,
      errorAgents: coordinatorStats.error,
      totalRuns: coordinatorStats.totalRuns,
      totalErrors: coordinatorStats.totalErrors,
    },
  });
});

router.post("/evolution/run", (_req, res) => {
  const proposal = proposeEvolution();
  res.json({
    ok: true,
    analyzedAt: new Date().toISOString(),
    proposal,
    hasProposal: proposal !== null,
  });
});

/* ── AGENT LOG ───────────────────────────────────────────────── */

router.get("/log", (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);
  const agent = req.query.agent as string | undefined;
  const log = getAgentLog(500);
  const filtered = agent ? log.filter((e) => e.agent === agent) : log;
  const stats = getAgentStats();
  res.json({
    entries: filtered.slice(-limit).reverse(),
    stats,
    totalEntries: log.length,
  });
});

/* ── CASE TRACES ─────────────────────────────────────────────── */

router.get("/traces", (_req, res) => {
  const traces = getAllCaseTraces();
  res.json({
    traces: traces.slice(-50).reverse(),
    total: traces.length,
  });
});

export default router;
