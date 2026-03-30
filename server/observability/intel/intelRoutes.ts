/**
 * System Intelligence Routes  —  /api/intel/*
 *
 * All 12 observability recommendations exposed as REST endpoints.
 * No auth required for read-only GET routes (mirrors /api/monitoring/*
 * pattern for internal tooling).  Write routes (rollback, toggle) require
 * admin role to be wired in index.ts when desired.
 *
 *  GET  /api/intel/system-map          — Rec 5 & 11: full topology
 *  GET  /api/intel/phases              — Rec 3: phase registry + health
 *  GET  /api/intel/phases/:phase       — Rec 3: single phase detail
 *  GET  /api/intel/orphans             — Rec 4 & 9: orphan + coverage scan
 *  GET  /api/intel/agents/vitality     — Rec 6: stale/ghost agent detection
 *  GET  /api/intel/agents/audit        — Rec 10: agent toggle audit trail
 *  GET  /api/intel/skills              — Rec 7: all skill statuses
 *  GET  /api/intel/skills/:skillId     — Rec 7: single skill status
 *  POST /api/intel/skills/:skillId/rollback — Rec 7: trigger skill rollback
 *  GET  /api/intel/engines             — Rec 2: scheduled + discovered engines
 *  GET  /api/intel/dependency-graph    — Rec 8: engine dependency graph
 *  POST /api/intel/golden/run          — Rec 12: golden case trigger
 */

import { Router, Request, Response } from "express";
import { getPhaseRegistry, getPhaseByName, getPhaseHealthSummary } from "./phaseRegistry";
import { runOrphanDetection }          from "./orphanDetector";
import { buildSystemMap }              from "./systemMap";
import { getStaleAgentSummary }        from "./staleAgentMonitor";
import { getAllSkillStatuses, getSkillStatus, rollbackSkill } from "./skillStatusService";
import { getAgentToggleAuditLog }      from "../../agents/agentConfig";
import { getEngineDependencyList }     from "../../analysis/engineDependencyGraph";
import { ENGINE_REGISTRY, discoverEngineFiles, getFullEngineList } from "../../system/engineScheduler";
import { logger }                      from "../../utils/logger";

const router = Router();

router.get("/system-map", (_req: Request, res: Response) => {
  try {
    res.json(buildSystemMap());
  } catch (e: any) {
    logger.error("intel_system_map_error", { error: e?.message });
    res.status(500).json({ error: "system_map_failed", message: e?.message });
  }
});

router.get("/phases", async (_req: Request, res: Response) => {
  try {
    const health = await getPhaseHealthSummary();
    res.json({ phases: health, total: health.length });
  } catch (e: any) {
    logger.error("intel_phases_error", { error: e?.message });
    res.status(500).json({ error: "phases_failed", message: e?.message });
  }
});

router.get("/phases/:phase", async (req: Request, res: Response) => {
  const record = getPhaseByName(req.params.phase);
  if (!record) return res.status(404).json({ error: "phase_not_found", phase: req.params.phase });
  let health = {};
  if (record.healthFn) {
    try { health = await record.healthFn(); } catch (e: any) { health = { error: e?.message }; }
  }
  res.json({ ...record, health });
});

router.get("/orphans", (_req: Request, res: Response) => {
  try {
    const report = runOrphanDetection();
    const statusCode = report.summary.totalOrphans > 0 ? 200 : 200;
    res.status(statusCode).json(report);
  } catch (e: any) {
    logger.error("intel_orphan_error", { error: e?.message });
    res.status(500).json({ error: "orphan_detection_failed", message: e?.message });
  }
});

router.get("/agents/vitality", (_req: Request, res: Response) => {
  try {
    res.json(getStaleAgentSummary());
  } catch (e: any) {
    logger.error("intel_agent_vitality_error", { error: e?.message });
    res.status(500).json({ error: "vitality_check_failed", message: e?.message });
  }
});

router.get("/agents/audit", (_req: Request, res: Response) => {
  try {
    const log = getAgentToggleAuditLog();
    res.json({ total: log.length, entries: log });
  } catch (e: any) {
    res.status(500).json({ error: "audit_log_failed", message: e?.message });
  }
});

router.get("/skills", (_req: Request, res: Response) => {
  try {
    const statuses = getAllSkillStatuses();
    res.json({
      total:    statuses.length,
      enabled:  statuses.filter(s => s.enabled).length,
      disabled: statuses.filter(s => !s.enabled).length,
      skills:   statuses,
    });
  } catch (e: any) {
    logger.error("intel_skills_error", { error: e?.message });
    res.status(500).json({ error: "skills_failed", message: e?.message });
  }
});

router.get("/skills/:skillId", (req: Request, res: Response) => {
  const status = getSkillStatus(req.params.skillId);
  if (!status) return res.status(404).json({ error: "skill_not_found", skillId: req.params.skillId });
  res.json(status);
});

router.post("/skills/:skillId/rollback", (req: Request, res: Response) => {
  const requestedBy = (req as any).user?.id ?? req.headers["x-requested-by"] as string ?? "api";
  const result = rollbackSkill(req.params.skillId, requestedBy);
  res.status(result.success ? 200 : 400).json(result);
});

router.get("/engines", (_req: Request, res: Response) => {
  const discovered = discoverEngineFiles();
  const full       = getFullEngineList();
  const unscheduled = discovered.filter(
    e => !ENGINE_REGISTRY.some(r => e.toLowerCase().includes(r.toLowerCase()))
  );
  res.json({
    scheduled:       ENGINE_REGISTRY,
    discovered:      discovered,
    full:            full,
    unscheduled:     unscheduled,
    scheduledCount:  ENGINE_REGISTRY.length,
    discoveredCount: discovered.length,
    unscheduledCount: unscheduled.length,
    coveragePct:     discovered.length > 0
      ? Math.round(((ENGINE_REGISTRY.length) / discovered.length) * 100)
      : 0,
  });
});

router.get("/dependency-graph", (_req: Request, res: Response) => {
  try {
    const graph = getEngineDependencyList();
    res.json({
      total:    graph.length,
      leaves:   graph.filter(n => n.level === "leaf").length,
      roots:    graph.filter(n => n.level === "root").length,
      nodes:    graph,
    });
  } catch (e: any) {
    logger.error("intel_dependency_graph_error", { error: e?.message });
    res.status(500).json({ error: "dependency_graph_failed", message: e?.message });
  }
});

router.get("/connected-services", async (_req: Request, res: Response) => {
  const checks = await Promise.allSettled([
    (async () => {
      const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!key) return { id: "openai", name: "OpenAI / ChatGPT", status: "unconfigured", latencyMs: null, detail: "No API key found" };
      const t0 = Date.now();
      const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
      return { id: "openai", name: "OpenAI / ChatGPT", status: r.ok ? "connected" : "error", latencyMs: Date.now() - t0, detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}` };
    })(),
    (async () => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return { id: "telegram", name: "Telegram Bot", status: "unconfigured", latencyMs: null, detail: "No bot token found" };
      const t0 = Date.now();
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(4000) });
      const body = await r.json() as any;
      return { id: "telegram", name: "Telegram Bot", status: (r.ok && body.ok) ? "connected" : "error", latencyMs: Date.now() - t0, detail: body.ok ? `@${body.result?.username}` : body.description };
    })(),
    (async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const tok = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !tok) return { id: "whatsapp", name: "WhatsApp (Twilio)", status: "unconfigured", latencyMs: null, detail: "No Twilio credentials found" };
      const t0 = Date.now();
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}` }, signal: AbortSignal.timeout(4000) });
      return { id: "whatsapp", name: "WhatsApp (Twilio)", status: r.ok ? "connected" : "error", latencyMs: Date.now() - t0, detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}` };
    })(),
    (async () => {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !tok) return { id: "redis", name: "Redis (Upstash)", status: "unconfigured", latencyMs: null, detail: "No Upstash credentials found" };
      const t0 = Date.now();
      const r = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(4000) });
      const body = await r.json() as any;
      return { id: "redis", name: "Redis (Upstash)", status: (r.ok && body.result === "PONG") ? "connected" : "error", latencyMs: Date.now() - t0, detail: body.result || `HTTP ${r.status}` };
    })(),
    (async () => {
      return { id: "langchain", name: "LangChain", status: "embedded", latencyMs: null, detail: "In-process library — no remote ping needed" };
    })(),
    (async () => {
      const healthy = !!process.env.DATABASE_URL || !!process.env.PGHOST;
      return { id: "postgres", name: "PostgreSQL", status: healthy ? "connected" : "unconfigured", latencyMs: null, detail: healthy ? "DB credentials present" : "No DB credentials" };
    })(),
  ]);

  const services = checks.map((c, i) => {
    if (c.status === "fulfilled") return c.value;
    return { id: `service_${i}`, name: `Service ${i}`, status: "error", latencyMs: null, detail: (c.reason as any)?.message ?? "unknown error" };
  });

  res.json({
    checkedAt: new Date().toISOString(),
    total: services.length,
    connected: services.filter((s: any) => s.status === "connected").length,
    unconfigured: services.filter((s: any) => s.status === "unconfigured").length,
    errors: services.filter((s: any) => s.status === "error").length,
    services,
  });
});

router.post("/golden/run", async (req: Request, res: Response) => {
  const { fileName } = req.body as { fileName?: string };
  try {
    const { runGoldenCases } = await import("../../testing/goldenCaseRunner");
    const results = await runGoldenCases(fileName ?? "goldenCases.sample.json");
    const passed  = Array.isArray(results) ? results.filter((r: any) => r.passed).length : 0;
    const total   = Array.isArray(results) ? results.length : 0;
    const failed  = total - passed;
    res.json({
      ran:      total,
      passed,
      failed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      results,
    });
  } catch (e: any) {
    logger.error("intel_golden_run_error", { error: e?.message });
    res.status(500).json({ error: "golden_run_failed", message: e?.message });
  }
});

export default router;
