export type HealthStatus = "green" | "yellow" | "red" | "gray";

export interface EngineHealth {
  name: string;
  status: HealthStatus;
  lastHeartbeat: number;
  lastSuccess?: number;
  lastFailure?: number;
  latencyMs?: number;
  errorCount: number;
  notes?: string;
}

export interface SkillHealth {
  name: string;
  status: HealthStatus;
  lastCalled?: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs?: number;
  lastError?: string;
}

export interface SkillTrace {
  skill: string;
  status: "success" | "failed" | "skipped";
  latencyMs?: number;
  input?: any;
  output?: any;
  reason?: string;
}

export interface CaseTrace {
  caseId: string;
  startedAt: number;
  steps: SkillTrace[];
}

const engineMap = new Map<string, EngineHealth>();
const skillMap  = new Map<string, SkillHealth>();
const caseMap   = new Map<string, CaseTrace>();

/* ─── ENGINE ─────────────────────────────────────────────── */

export function registerEngine(name: string) {
  if (!engineMap.has(name)) {
    engineMap.set(name, { name, status: "gray", lastHeartbeat: Date.now(), errorCount: 0 });
  }
}

export function heartbeatEngine(name: string) {
  const e = engineMap.get(name);
  if (!e) return;
  e.lastHeartbeat = Date.now();
  if (e.status === "gray") e.status = "green";
}

export function recordEngineSuccess(name: string, latencyMs: number) {
  const e = engineMap.get(name);
  if (!e) return;
  e.lastSuccess  = Date.now();
  e.latencyMs    = latencyMs;
  e.status       = latencyMs > 2000 ? "yellow" : "green";
  e.lastHeartbeat = Date.now();
}

export function recordEngineFailure(name: string, err: string) {
  const e = engineMap.get(name);
  if (!e) return;
  e.lastFailure = Date.now();
  e.errorCount += 1;
  e.status      = "red";
  e.notes       = err;
}

export function resetEngineStatus(name: string) {
  const e = engineMap.get(name);
  if (!e) return;
  e.status = "green";
  e.notes  = undefined;
}

export function getEngines(): EngineHealth[] {
  return Array.from(engineMap.values());
}

export function getEngine(name: string) {
  return engineMap.get(name);
}

/* ─── SKILL ──────────────────────────────────────────────── */

export function registerSkill(name: string) {
  if (!skillMap.has(name)) {
    skillMap.set(name, { name, status: "gray", successCount: 0, failureCount: 0 });
  }
}

export function recordSkillSuccess(name: string, latencyMs: number) {
  const s = skillMap.get(name);
  if (!s) return;
  s.lastCalled   = Date.now();
  s.successCount += 1;
  s.avgLatencyMs  = s.avgLatencyMs != null ? (s.avgLatencyMs + latencyMs) / 2 : latencyMs;
  s.status        = latencyMs > 1500 ? "yellow" : "green";
}

export function recordSkillFailure(name: string, err: string) {
  const s = skillMap.get(name);
  if (!s) return;
  s.lastCalled   = Date.now();
  s.failureCount += 1;
  s.status       = "red";
  s.lastError    = err;
}

export function getSkills(): SkillHealth[] {
  return Array.from(skillMap.values());
}

/* ─── CASE TRACE ─────────────────────────────────────────── */

export function startCase(caseId: string) {
  caseMap.set(caseId, { caseId, startedAt: Date.now(), steps: [] });
}

export function addTraceStep(caseId: string, step: SkillTrace) {
  const c = caseMap.get(caseId);
  if (!c) return;
  c.steps.push(step);
}

export function getCaseTrace(caseId: string) {
  return caseMap.get(caseId);
}

export function getAllCaseTraces(): CaseTrace[] {
  return Array.from(caseMap.values()).slice(-50);
}

/* ─── SEED CORE ENGINES + SKILLS ────────────────────────── */
const CORE_ENGINES = [
  "alertEngine", "governance", "digitalTwin", "predictive",
  "chaosScheduler", "autonomousLoop", "triageOptimizer",
  "loadBalancer", "recoveryLoop", "ruleEngine",
];
const CORE_SKILLS = [
  "centor_score", "perc_score", "curb65", "gcs",
  "news2", "cha2ds2vasc", "ottawa", "alvarado",
  "auto_icd10", "auto_cpt", "denial_prediction",
  "phi_redaction", "audit_log", "billing_submit",
];

CORE_ENGINES.forEach(registerEngine);
CORE_SKILLS.forEach(registerSkill);

/* ─── Heartbeat the engines every 5s so they stay green ── */
setInterval(() => {
  CORE_ENGINES.forEach(heartbeatEngine);
}, 5000);
