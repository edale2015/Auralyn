/**
 * server/agents/brainOrchestrator.ts
 *
 * Unified multi-agent brain orchestrator.
 * Wires together the existing Risk, ICU, Safety Gate, Digital Twin,
 * and Hospital Routing engines into a single coordinated cycle.
 *
 * This does NOT replace the full clinical orchestrator (orchestrator.ts).
 * It is a higher-level control-loop that reads live patient vitals,
 * runs them through every reasoning layer, and produces a structured
 * decision + audit entry.
 */

import crypto from "crypto";
import { logEvent } from "../audit/hashChain";
import { runDigitalTwin } from "../simulation/digitalTwinEngine";
import { broadcastPatientEvent } from "../ws/patientStream";

// ── Patient vitals model ──────────────────────────────────────────────────────

export interface PatientVitals {
  patientId: string;
  name?: string;
  hr: number;       // bpm
  spo2: number;     // %
  temp: number;     // °F
  sbp: number;      // systolic BP
  dbp: number;      // diastolic BP
  rr: number;       // respiratory rate
  complaint?: string;
  ts: number;
}

// ── Risk scoring ──────────────────────────────────────────────────────────────

export interface RiskResult {
  score: number;    // 0–1
  level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  flags: string[];
}

export function scoreRisk(v: PatientVitals): RiskResult {
  let score = 0;
  const flags: string[] = [];

  if (v.spo2 < 88)  { score += 0.45; flags.push("SpO2 critically low"); }
  else if (v.spo2 < 92) { score += 0.25; flags.push("SpO2 low"); }

  if (v.hr > 130)   { score += 0.30; flags.push("Tachycardia severe"); }
  else if (v.hr > 110) { score += 0.15; flags.push("Tachycardia"); }
  else if (v.hr < 45)  { score += 0.25; flags.push("Bradycardia"); }

  if (v.temp > 103)  { score += 0.20; flags.push("Fever high"); }
  else if (v.temp > 101) { score += 0.10; flags.push("Fever"); }
  else if (v.temp < 96)  { score += 0.20; flags.push("Hypothermia"); }

  if (v.sbp < 90)   { score += 0.35; flags.push("Hypotension critical"); }
  else if (v.sbp < 100) { score += 0.15; flags.push("Hypotension"); }
  else if (v.sbp > 180)  { score += 0.20; flags.push("Hypertensive crisis"); }

  if (v.rr > 28)    { score += 0.20; flags.push("Respiratory distress"); }
  else if (v.rr < 8) { score += 0.30; flags.push("Respiratory depression"); }

  score = Math.min(1, score);
  const level: RiskResult["level"] =
    score >= 0.80 ? "CRITICAL" :
    score >= 0.55 ? "HIGH"     :
    score >= 0.30 ? "MODERATE" : "LOW";

  return { score, level, flags };
}

// ── ICU decision ──────────────────────────────────────────────────────────────

export interface ICUDecision {
  needsICU: boolean;
  needsPhysician: boolean;
  urgency: "immediate" | "urgent" | "routine" | "monitor";
  reason: string;
}

export function icuDecision(risk: RiskResult): ICUDecision {
  if (risk.level === "CRITICAL") {
    return { needsICU: true, needsPhysician: true, urgency: "immediate", reason: "Critical risk — ICU transfer required immediately" };
  }
  if (risk.level === "HIGH") {
    return { needsICU: false, needsPhysician: true, urgency: "urgent", reason: "High risk — physician review within 15 minutes" };
  }
  if (risk.level === "MODERATE") {
    return { needsICU: false, needsPhysician: false, urgency: "routine", reason: "Moderate risk — standard monitoring" };
  }
  return { needsICU: false, needsPhysician: false, urgency: "monitor", reason: "Low risk — routine monitoring" };
}

// ── Safety gate ───────────────────────────────────────────────────────────────

export interface SafetyGateResult {
  allowed: boolean;
  requiresApproval: boolean;
  blockedReason?: string;
}

export function safetyGate(icu: ICUDecision, risk: RiskResult): SafetyGateResult {
  if (icu.needsICU) {
    return { allowed: false, requiresApproval: true, blockedReason: "ICU transfer requires physician co-signature before execution" };
  }
  if (risk.score > 0.85) {
    return { allowed: false, requiresApproval: true, blockedReason: "Risk score above safety threshold — physician override required" };
  }
  return { allowed: true, requiresApproval: false };
}

// ── Routing suggestion ────────────────────────────────────────────────────────

export type RouteDestination = "ER" | "ICU" | "CLINIC" | "TELEMED" | "MONITOR";

export interface RoutingResult {
  destination: RouteDestination;
  urgency: "immediate" | "urgent" | "routine";
  reason: string;
  alternateHospitals?: string[];
}

export function suggestRoute(risk: RiskResult, icu: ICUDecision): RoutingResult {
  if (icu.needsICU) {
    return { destination: "ICU", urgency: "immediate", reason: "Critical deterioration — direct ICU admission", alternateHospitals: ["Bellevue Hospital", "NYC Health + Hospitals/Harlem"] };
  }
  if (icu.urgency === "urgent") {
    return { destination: "ER", urgency: "urgent", reason: "High acuity — Emergency evaluation required" };
  }
  if (risk.level === "MODERATE") {
    return { destination: "CLINIC", urgency: "routine", reason: "Moderate acuity — clinic evaluation same day" };
  }
  return { destination: "MONITOR", urgency: "routine", reason: "Low acuity — vitals monitoring, discharge if stable" };
}

// ── Insight generator ─────────────────────────────────────────────────────────

export interface Insight {
  message: string;
  action: string;
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "INFO";
  patientId: string;
}

export function generateInsights(vitals: PatientVitals, risk: RiskResult, icu: ICUDecision): Insight[] {
  const insights: Insight[] = [];

  for (const flag of risk.flags) {
    insights.push({
      message: `Patient ${vitals.patientId}: ${flag}`,
      action: icu.urgency === "immediate" ? "Activate emergency response" :
              icu.urgency === "urgent"    ? "Page on-call physician"      :
              "Continue monitoring",
      priority: risk.level === "CRITICAL" ? "CRITICAL" :
                risk.level === "HIGH"     ? "HIGH"     :
                risk.level === "MODERATE" ? "MODERATE" : "INFO",
      patientId: vitals.patientId,
    });
  }

  if (insights.length === 0) {
    insights.push({
      message: `Patient ${vitals.patientId}: All vitals within acceptable range`,
      action: "Continue routine monitoring",
      priority: "INFO",
      patientId: vitals.patientId,
    });
  }

  return insights;
}

// ── Full agent cycle ──────────────────────────────────────────────────────────

export interface AgentCycleResult {
  patientId:  string;
  vitals:     PatientVitals;
  risk:       RiskResult;
  icu:        ICUDecision;
  safety:     SafetyGateResult;
  twin:       ReturnType<typeof runDigitalTwin>;
  routing:    RoutingResult;
  insights:   Insight[];
  auditHash:  string;
  durationMs: number;
  ts:         number;
}

export async function runAgentCycle(vitals: PatientVitals): Promise<AgentCycleResult> {
  const start = Date.now();

  const risk    = scoreRisk(vitals);
  const icu     = icuDecision(risk);
  const safety  = safetyGate(icu, risk);
  const twin    = runDigitalTwin({ result: { trajectory: { riskScore: risk.score } } });
  const routing = suggestRoute(risk, icu);
  const insights = generateInsights(vitals, risk, icu);

  const entry = logEvent({
    patientId: vitals.patientId,
    risk:      { level: risk.level, score: risk.score },
    icu:       { needsICU: icu.needsICU, urgency: icu.urgency },
    safety:    { allowed: safety.allowed },
    routing:   { destination: routing.destination },
    ts:        Date.now(),
  });

  const result: AgentCycleResult = {
    patientId: vitals.patientId,
    vitals,
    risk,
    icu,
    safety,
    twin,
    routing,
    insights,
    auditHash: entry.hash,
    durationMs: Date.now() - start,
    ts: Date.now(),
  };

  // Broadcast to any WebSocket subscribers
  broadcastPatientEvent({ type: "agent_cycle", ...result });

  return result;
}

// ── Patient simulator (for autonomous loop) ───────────────────────────────────

const DEMO_NAMES = [
  "J. Rivera",  "M. Chen",   "A. Patel",   "D. Thompson",
  "S. Kim",     "L. Garcia",  "R. Johnson", "T. Williams",
  "C. Martinez","B. Anderson","E. Wilson",  "N. Davis",
];

export function generateSimulatedPatient(seed?: number): PatientVitals {
  const r = seed !== undefined ? Math.sin(seed + Date.now() / 10000) * 0.5 + 0.5 : Math.random();
  const idx = Math.floor(r * 9999) % DEMO_NAMES.length;

  // Occasionally generate abnormal vitals to make the demo interesting
  const isAbnormal = Math.random() < 0.25;
  const isCritical = Math.random() < 0.08;

  return {
    patientId: `SIM-${String(Math.floor(r * 9999)).padStart(4, "0")}`,
    name:      DEMO_NAMES[idx],
    hr:    isCritical ? 138 + Math.random() * 20 : isAbnormal ? 110 + Math.random() * 20 : 60 + Math.random() * 40,
    spo2:  isCritical ? 82 + Math.random() * 5  : isAbnormal ? 90 + Math.random() * 4  : 95 + Math.random() * 4,
    temp:  isCritical ? 103 + Math.random() * 2 : isAbnormal ? 101 + Math.random() * 2 : 97 + Math.random() * 2,
    sbp:   isCritical ? 82 + Math.random() * 10 : isAbnormal ? 145 + Math.random() * 20 : 110 + Math.random() * 30,
    dbp:   60 + Math.random() * 20,
    rr:    isCritical ? 30 + Math.random() * 8  : isAbnormal ? 22 + Math.random() * 6  : 12 + Math.random() * 6,
    complaint: ["chest pain", "shortness of breath", "fever", "dizziness", "abdominal pain", "headache"][Math.floor(Math.random() * 6)],
    ts: Date.now(),
  };
}

// ── Autonomous loop ───────────────────────────────────────────────────────────

export interface LoopState {
  running:     boolean;
  cycleCount:  number;
  lastCycleMs: number | null;
  startedAt:   number | null;
  errors:      number;
  recentResults: AgentCycleResult[];
  recentInsights: Insight[];
}

const MAX_RECENT = 20;
const MAX_INSIGHTS = 50;

let loopState: LoopState = {
  running:        false,
  cycleCount:     0,
  lastCycleMs:    null,
  startedAt:      null,
  errors:         0,
  recentResults:  [],
  recentInsights: [],
};

let loopTimer: ReturnType<typeof setTimeout> | null = null;

export function getLoopState(): LoopState {
  return { ...loopState, recentResults: [...loopState.recentResults], recentInsights: [...loopState.recentInsights] };
}

async function runLoopCycle() {
  if (!loopState.running) return;

  try {
    // Generate 3-5 patients per cycle for a busy clinic feel
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const vitals = generateSimulatedPatient(i);
      const result = await runAgentCycle(vitals);

      loopState.recentResults = [result, ...loopState.recentResults].slice(0, MAX_RECENT);
      loopState.recentInsights = [...result.insights, ...loopState.recentInsights]
        .filter(ins => ins.priority !== "INFO" || loopState.recentInsights.length < 10)
        .slice(0, MAX_INSIGHTS);
    }
    loopState.cycleCount++;
    loopState.lastCycleMs = Date.now();
  } catch (e: any) {
    loopState.errors++;
    console.error("[AgentBrain] Loop cycle error:", e?.message);
  }

  if (loopState.running) {
    loopTimer = setTimeout(runLoopCycle, 4000); // Every 4 seconds
  }
}

export function startLoop(): { started: boolean; message: string } {
  if (loopState.running) return { started: false, message: "Loop already running" };
  loopState.running   = true;
  loopState.startedAt = Date.now();
  loopTimer = setTimeout(runLoopCycle, 100);
  console.log("[AgentBrain] Autonomous loop started");
  return { started: true, message: "Autonomous agent loop started" };
}

export function stopLoop(): { stopped: boolean; message: string } {
  if (!loopState.running) return { stopped: false, message: "Loop not running" };
  loopState.running = false;
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  console.log("[AgentBrain] Autonomous loop stopped");
  return { stopped: true, message: "Loop stopped" };
}
