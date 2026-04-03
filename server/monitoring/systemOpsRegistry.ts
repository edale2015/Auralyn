/**
 * System Operations Registry
 *
 * Aggregates live data from four registries into a single unified component list:
 *   1. engineRegistry    (brain) — 60+ registered clinical engines with layer/description
 *   2. healthRegistry    (monitoring) — live heartbeat, latency, error counts
 *   3. loopRegistry      (monitoring) — background loop status + restart capability
 *   4. skillRegistry     (core) — skills with enabled/toggle
 *   5. ambientHealth     (monitoring) — integrated service health (6 dots)
 *
 * Returned as OpsComponent[] — one row per component in the System Ops Grid.
 */

import { getAllEngines } from "../brain/engineRegistry";
import { getEngines as getHealthEngines, getSkills as getHealthSkills } from "./healthRegistry";
import { getAllLoops } from "./loopRegistry";
import { getAllSkills } from "../core/skills/skillRegistry";
import { getAmbientHealthSnapshot, DotStatus } from "./ambientHealthAggregator";
import { listTools } from "../services/agents/toolRegistry";
import { isBullAvailable } from "../queues/bullmq/connection";
import { pg } from "../db/postgres";

export type OpsStatus = "active" | "degraded" | "error" | "stopped" | "stub" | "planned" | "unknown";
export type OpsHealth = "green" | "amber" | "red" | "gray";
export type OpsType = "Engine" | "Skill" | "Agent" | "Loop" | "Service" | "Integration";

export interface OpsComponent {
  id: string;
  name: string;
  type: OpsType;
  category: string;
  status: OpsStatus;
  health: OpsHealth;
  description: string;
  latencyMs?: number;
  errorCount: number;
  cycleCount?: number;
  lastRunMs?: number;
  enabled: boolean;
  canRestart: boolean;
  canToggle: boolean;
  dashboardPath?: string;
  tags?: string[];
  detail?: string;
  filePath?: string;
}

function dotToHealth(dot: DotStatus): OpsHealth {
  if (dot === "green") return "green";
  if (dot === "amber") return "amber";
  if (dot === "red") return "red";
  return "gray";
}

function healthStatusToOps(h: "green" | "yellow" | "red" | "gray"): { status: OpsStatus; health: OpsHealth } {
  if (h === "green") return { status: "active", health: "green" };
  if (h === "yellow") return { status: "degraded", health: "amber" };
  if (h === "red") return { status: "error", health: "red" };
  return { status: "unknown", health: "gray" };
}

function loopToOps(loop: ReturnType<typeof getAllLoops>[number]): { status: OpsStatus; health: OpsHealth } {
  if (loop.status === "running") return { status: "active", health: "green" };
  if (loop.status === "stale") return { status: "degraded", health: "amber" };
  if (loop.status === "crashed") return { status: "error", health: "red" };
  return { status: "stopped", health: "gray" };
}

export async function getSystemOpsComponents(): Promise<OpsComponent[]> {
  const components: OpsComponent[] = [];

  // ── 1. ENGINES (brain engineRegistry + healthRegistry heartbeat) ───────────
  const allEngines = getAllEngines();
  const liveEngines = new Map(getHealthEngines().map(e => [e.name, e]));

  for (const engine of allEngines) {
    const live = liveEngines.get(engine.name);
    const { status, health } = live
      ? healthStatusToOps(live.status)
      : engine.status === "active" ? { status: "active" as OpsStatus, health: "gray" as OpsHealth }
      : engine.status === "stub" ? { status: "stub" as OpsStatus, health: "gray" as OpsHealth }
      : { status: "planned" as OpsStatus, health: "gray" as OpsHealth };

    components.push({
      id: `engine:${engine.name}`,
      name: engine.name
        .replace(/Engine$/, "")
        .replace(/([A-Z])/g, " $1")
        .trim(),
      type: "Engine",
      category: (engine as any).layer ?? "Clinical",
      status,
      health,
      description: engine.description,
      latencyMs: live?.latencyMs ?? engine.avgDurationMs,
      errorCount: live?.errorCount ?? 0,
      lastRunMs: live?.lastSuccess,
      enabled: engine.status !== "planned",
      canRestart: false,
      canToggle: false,
      dashboardPath: "/engine-maintenance",
      filePath: engine.filePath,
      tags: [(engine as any).layer ?? "Clinical"],
    });
  }

  // ── 2. SKILLS ─────────────────────────────────────────────────────────────
  const allSkills = getAllSkills();
  const liveSkills = new Map(getHealthSkills().map(s => [s.name, s]));

  for (const skill of allSkills) {
    const live = liveSkills.get(skill.id) ?? liveSkills.get(skill.name);
    let health: OpsHealth = skill.enabled ? "green" : "gray";
    let status: OpsStatus = skill.enabled ? "active" : "stopped";
    if (live) {
      const derived = healthStatusToOps(live.status);
      health = derived.health;
      status = derived.status;
    }
    components.push({
      id: `skill:${skill.id}`,
      name: skill.name,
      type: "Skill",
      category: skill.category,
      status,
      health,
      description: skill.description,
      latencyMs: live?.avgLatencyMs,
      errorCount: live?.failureCount ?? 0,
      lastRunMs: live?.lastCalled,
      enabled: skill.enabled,
      canRestart: false,
      canToggle: true,
      dashboardPath: "/skill-layer-admin",
      tags: skill.tags,
      detail: `v${skill.version} · deps: ${skill.engineDeps.join(", ")}`,
    });
  }

  // ── 3. BACKGROUND LOOPS ───────────────────────────────────────────────────
  const loops = getAllLoops();
  for (const loop of loops) {
    const { status, health } = loopToOps(loop);
    const intervalLabel = loop.intervalMs >= 60000
      ? `${loop.intervalMs / 60000}min`
      : `${loop.intervalMs / 1000}s`;

    components.push({
      id: `loop:${loop.name}`,
      name: loop.name,
      type: "Loop",
      category: "Background",
      status,
      health,
      description: loop.description,
      errorCount: loop.errorCount,
      cycleCount: loop.cycleCount,
      lastRunMs: loop.lastHeartbeat,
      enabled: loop.status !== "stopped",
      canRestart: !!loop.restartFn,
      canToggle: false,
      dashboardPath: "/system-control-tower",
      detail: `interval: ${intervalLabel} · ${loop.cycleCount} cycles`,
    });
  }

  // ── 4. AGENTS (tool registry) ─────────────────────────────────────────────
  try {
    const tools = listTools();
    for (const tool of tools) {
      components.push({
        id: `agent:${tool.id}`,
        name: tool.name ?? tool.id,
        type: "Agent",
        category: "Agents",
        status: "active",
        health: "green",
        description: tool.description ?? "Registered agent tool",
        errorCount: 0,
        enabled: true,
        canRestart: false,
        canToggle: false,
        dashboardPath: "/agent-lab",
      });
    }
  } catch { /* agent registry not populated */ }

  // ── 5. INTEGRATED SERVICES (ambient health + infra probes) ────────────────
  const ambient = await getAmbientHealthSnapshot();
  for (const dot of ambient.dots) {
    components.push({
      id: `service:${dot.key}`,
      name: dot.label,
      type: "Service",
      category: "Services",
      status: dot.status === "green" ? "active"
             : dot.status === "amber" ? "degraded"
             : dot.status === "red" ? "error" : "unknown",
      health: dotToHealth(dot.status),
      description: dot.degradedMessage ?? dot.detail,
      errorCount: dot.status === "red" ? 1 : 0,
      enabled: true,
      canRestart: false,
      canToggle: false,
      dashboardPath: "/integration-health",
      detail: dot.detail,
    });
  }

  // ── 6. INFRASTRUCTURE INTEGRATIONS ────────────────────────────────────────
  const redisOk = isBullAvailable();
  let dbOk = true;
  let dbDetail = "Connected";
  try {
    await (pg as any).query("SELECT 1");
  } catch (e: any) {
    dbOk = false;
    dbDetail = e?.message ?? "Connection error";
  }

  const infra: Array<{ id: string; name: string; ok: boolean; detail: string; path: string }> = [
    { id: "infra:postgres", name: "PostgreSQL Database", ok: dbOk, detail: dbOk ? dbDetail : dbDetail, path: "/system" },
    { id: "infra:redis", name: "Redis / BullMQ Queue", ok: redisOk, detail: redisOk ? "Queue workers active" : "Connection timed out — queue workers degraded", path: "/workers" },
    { id: "infra:openai", name: "OpenAI API", ok: Boolean(process.env.OPENAI_API_KEY), detail: process.env.OPENAI_API_KEY ? "Key configured" : "OPENAI_API_KEY not set", path: "/integration-health" },
    { id: "infra:twilio", name: "Twilio / WhatsApp", ok: Boolean(process.env.TWILIO_FROM_NUMBER), detail: process.env.TWILIO_FROM_NUMBER ? "Configured" : "Not configured", path: "/integration-health" },
    { id: "infra:telegram", name: "Telegram Gateway", ok: Boolean(process.env.TELEGRAM_BOT_TOKEN), detail: process.env.TELEGRAM_BOT_TOKEN ? "Bot token set" : "TELEGRAM_BOT_TOKEN not set", path: "/integration-health" },
  ];

  for (const inf of infra) {
    components.push({
      id: inf.id,
      name: inf.name,
      type: "Integration",
      category: "Infrastructure",
      status: inf.ok ? "active" : "degraded",
      health: inf.ok ? "green" : "amber",
      description: inf.detail,
      errorCount: inf.ok ? 0 : 1,
      enabled: true,
      canRestart: false,
      canToggle: false,
      dashboardPath: inf.path,
      detail: inf.detail,
    });
  }

  return components;
}

/** Attempt restart for a registered loop. Returns true if restarted. */
export function restartLoop(name: string): boolean {
  const loops = getAllLoops();
  const loop = loops.find(l => l.name === name);
  if (!loop || !loop.restartFn) return false;
  try {
    loop.restartFn();
    loop.lastHeartbeat = Date.now();
    loop.status = "running";
    return true;
  } catch {
    loop.status = "crashed";
    return false;
  }
}
