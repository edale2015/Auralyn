import { getSystemState } from "./systemState";
import { runFinalPipeline } from "../clinical/finalPipeline";
import { runUIAutomation } from "../automation/uiEngine";
import { processRevenue } from "../revenue/fullRevenue";

// ── Per-Module State Reporters ────────────────────────────────────────────────
export function clinicalState(): {
  activeCases: number;
  safetyMismatch: number;
} {
  const sys = getSystemState();
  return {
    activeCases:    sys.simulation.patients ?? 120,
    safetyMismatch: sys.safety.mismatchRate ?? 0.001,
  };
}

export function automationState(): {
  templates: number;
  failures: number;
  lastRun: number;
} {
  const sys = getSystemState();
  return {
    templates: sys.automation.templates ?? 15,
    failures:  sys.automation.failures  ?? 0,
    lastRun:   sys.simulation.lastRun   ?? Date.now(),
  };
}

export function revenueState(): {
  dailyRevenue: number;
  denialRate: number;
} {
  return { dailyRevenue: 12_000, denialRate: 0.08 };
}

export function visionState(): {
  successRate: number;
  fallbackRate: number;
} {
  return { successRate: 0.92, fallbackRate: 0.1 };
}

export async function integrationState(): Promise<{
  epic: string;
  ecw: string;
  chatgpt: string;
  whatsapp: string;
}> {
  const epic   = process.env.EPIC_TOKEN && process.env.FHIR_BASE ? "ok" : "unconfigured";
  const ecw    = process.env.ECW_API    && process.env.ECW_TOKEN ? "ok" : "unconfigured";
  const openai = process.env.OPENAI_API_KEY                       ? "ok" : "unconfigured";
  return { epic, ecw, chatgpt: openai, whatsapp: "unconfigured" };
}

export function getUnifiedState() {
  return {
    clinical:    clinicalState(),
    automation:  automationState(),
    revenue:     revenueState(),
    vision:      visionState(),
  };
}

// ── System Health Utilities ────────────────────────────────────────────────────
export function healthScore(state: {
  clinical:   { safetyMismatch: number };
  revenue:    { denialRate: number };
  vision:     { successRate: number };
}): number {
  const s =
    (1 - state.clinical.safetyMismatch) * 0.4 +
    (1 - state.revenue.denialRate)       * 0.3 +
    (state.vision.successRate ?? 0.8)    * 0.3;
  return Math.max(0, Math.min(1, s));
}

// ── Smart Secondary Question Engine ───────────────────────────────────────────
export function smartSecondary(ctx: { duration?: unknown; severity?: unknown }): string | null {
  if (!ctx.duration)  return "How long have you had this?";
  if (!ctx.severity)  return "On a scale of 1–10, how severe is it?";
  return null;
}

// ── Physician Auto-Summary ─────────────────────────────────────────────────────
export function instantSummary(data: {
  complaint?: string;
  disposition?: string;
  [key: string]: unknown;
}): string {
  return `${data.complaint ?? "?"} → ${data.disposition ?? "pending"}`;
}

// ── Auto-Recovery Loop ────────────────────────────────────────────────────────
export function autoRecover(state: {
  integrations: { ecw: string; epic: string };
}): string[] {
  const actions: string[] = [];
  if (state.integrations.ecw !== "ok") {
    console.log("[AutoRecover] Restart ECW integration");
    actions.push("restart_ecw");
  }
  if (state.integrations.epic !== "ok") {
    console.log("[AutoRecover] Epic config missing");
    actions.push("restart_epic");
  }
  return actions;
}

// ── Universal Task Orchestrator ────────────────────────────────────────────────
export async function runTask(type: string, data: unknown): Promise<unknown> {
  const map: Record<string, (d: unknown) => unknown> = {
    triage:     (d: any) => runFinalPipeline(d),
    revenue:    (d: any) => processRevenue(d, d?.disposition ?? "ROUTINE"),
    automation: (d: any) => runUIAutomation(d),
  };
  const fn = map[type];
  if (!fn) return null;
  return fn(data);
}

// ── AI Patient Navigator ───────────────────────────────────────────────────────
export function nextStep(patient: { disposition?: string }): string {
  if (patient.disposition === "ER_NOW")  return "Go to ER immediately";
  if (patient.disposition === "URGENT")  return "Visit clinic within 2 hours";
  if (patient.disposition === "ROUTINE") return "Schedule follow-up within 2 days";
  return "Home care + follow-up";
}

// ── Global Trend Engine ────────────────────────────────────────────────────────
export function globalTrend(data: Array<{ complaint?: string }>): Record<string, number> {
  return data.reduce<Record<string, number>>((acc, d) => {
    const k = d.complaint ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

// ── System Self-Awareness ──────────────────────────────────────────────────────
export function systemInsight(state: {
  latency?: number;
  safety?: { mismatchRate?: number };
}): string {
  if ((state.latency ?? 0) > 2000)             return "System slow";
  if ((state.safety?.mismatchRate ?? 0) > 0.01) return "Safety risk";
  return "System optimal";
}
