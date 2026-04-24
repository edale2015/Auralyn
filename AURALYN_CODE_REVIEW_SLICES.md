# AURALYN — Comprehensive Code Review Slices
# For AI Review (ChatGPT / Claude)
#
# Project: Auralyn — HIPAA/FDA Medical Triage SaaS
# Stack: Express 5 + TypeScript backend | React 18 + Vite frontend
# Context: Multi-tenant NYC urgent care, 1 physician / 500+ patients/day.
# Fully autonomous research pipeline + multi-agent clinical decision engine.
#
# HOW TO USE THIS DOCUMENT
# Each slice is a self-contained architectural section. Review them in order
# or skip to specific ones. Ask for recommendations on:
#   - Architecture patterns and anti-patterns
#   - Safety & correctness of clinical logic
#   - Security, HIPAA compliance, or audit chain weaknesses
#   - Performance, scalability, and reliability gaps
#   - Missing features or better design alternatives
# ─────────────────────────────────────────────────────────────────────────────

================================================================================
SLICE 1 — SHARED DATA MODEL  (shared/schema.ts)
================================================================================
Drizzle ORM + Zod schema. Defines every Postgres table, insert/select types.
Full file is 1,797 lines; key tables shown below.
================================================================================

```typescript
// shared/schema.ts (representative extract — tables 1-12 of ~40)

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp,
         boolean, jsonb, real, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Physicians ─────────────────────────────────────────────────────────────────
export const physicians = pgTable("physicians", {
  id:        serial("id").primaryKey(),
  username:  text("username").notNull().unique(),
  password:  text("password").notNull(),
  name:      text("name").notNull(),
  specialty: text("specialty"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertPhysicianSchema = createInsertSchema(physicians).omit({ id: true, createdAt: true });
export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Physician       = typeof physicians.$inferSelect;

// ── Patients (from WhatsApp) ───────────────────────────────────────────────────
export const patients = pgTable("patients", {
  id:          serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  name:        text("name"),
  createdAt:   timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Encounters (medical cases) ────────────────────────────────────────────────
export const encounters = pgTable("encounters", {
  id:                   serial("id").primaryKey(),
  patientId:            integer("patient_id").notNull().references(() => patients.id),
  chiefComplaint:       text("chief_complaint"),
  conversationHistory:  text("conversation_history"),   // JSON — WhatsApp messages
  aiDiagnosis:          text("ai_diagnosis"),
  aiDisposition:        text("ai_disposition"),
  aiConfidence:         integer("ai_confidence"),        // 0-100
  status:               text("status").notNull().default("gathering_info"),
  urgencyLevel:         text("urgency_level").default("routine"),
  physicianId:          integer("physician_id").references(() => physicians.id),
  physicianDiagnosis:   text("physician_diagnosis"),
  physicianDisposition: text("physician_disposition"),
  physicianNotes:       text("physician_notes"),
  approvedAt:           timestamp("approved_at"),
  createdAt:            timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt:            timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // ENT Flu Flow fields
  system:            text("system"),
  complaint:         text("complaint"),
  specialty:         text("specialty"),
  flowId:            text("flow_id"),
  flowIndex:         integer("flow_index").default(0),
  answers:           text("answers"),       // JSON string
  proposal:          text("proposal"),      // JSON string
  physicianSummary:  text("physician_summary"),
  // Intake linking
  intakeCaseId:      text("intake_case_id"),
  intakeLinkEvents:  text("intake_link_events"),
  intakeLinkedAt:    timestamp("intake_linked_at"),
  intakeToken:       text("intake_token"),
  intakeCode:        text("intake_code"),
  intakeExpiresAt:   text("intake_expires_at"),
});

// ── Immutable Audit Logs (SHA-256 hash chain) ──────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id:        serial("id").primaryKey(),
  traceId:   text("trace_id").notNull(),
  step:      text("step").notNull(),
  input:     jsonb("input"),
  output:    jsonb("output"),
  metadata:  jsonb("metadata"),
  hash:      text("hash"),
  prevHash:  text("prev_hash"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  traceIdIdx:   index("idx_audit_logs_trace_id").on(t.traceId),
  createdAtIdx: index("idx_audit_logs_created_at").on(t.createdAt),
}));

// ── Patient Sessions (persistent queue — replaces in-memory) ──────────────────
export const patientSessions = pgTable("patient_sessions", {
  id:           text("id").primaryKey(),
  status:       text("status").notNull(),
  riskLevel:    text("risk_level"),
  safetyFlags:  jsonb("safety_flags").default([]),
  disposition:  jsonb("disposition"),
  approvedBy:   text("approved_by"),
  overrideData: jsonb("override_data"),
  createdAt:    timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt:    timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  statusIdx:    index("idx_patient_sessions_status").on(t.status),
  createdAtIdx: index("idx_patient_sessions_created_at").on(t.createdAt),
}));

// ── Autonomy Metrics (FDA evidence, trust metric) ─────────────────────────────
export const autonomyMetrics = pgTable("autonomy_metrics", {
  id:                  serial("id").primaryKey(),
  traceId:             text("trace_id"),
  complaint:           text("complaint"),
  mode:                text("mode").notNull(),
  dispositionGiven:    text("disposition_given"),
  confidence:          real("confidence"),
  wasOverridden:       boolean("was_overridden").default(false).notNull(),
  safetyTriggered:     boolean("safety_triggered").default(false).notNull(),
  guardrailsTriggered: text("guardrails_triggered").array().default([]),
  createdAt:           timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Multi-tenant Clinic Sites ─────────────────────────────────────────────────
export const clinicSites = pgTable("clinic_sites", {
  id:             serial("id").primaryKey(),
  externalId:     text("external_id").unique(),
  name:           varchar("name", { length: 255 }).notNull(),
  ehrVendor:      varchar("ehr_vendor", { length: 100 }),
  fhirTenantKey:  varchar("fhir_tenant_key", { length: 255 }),
  plan:           varchar("plan", { length: 50 }).default("basic").notNull(),
  status:         varchar("status", { length: 50 }).default("active").notNull(),
  createdAt:      timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Knowledge Base: Red Flag Rules ────────────────────────────────────────────
export const kbRedFlagRules = pgTable("kb_red_flag_rules", {
  id:               serial("id").primaryKey(),
  ruleId:           text("rule_id").notNull().unique(),
  complaintId:      text("complaint_id").notNull(),
  label:            text("label").notNull(),
  triggerExpr:      text("trigger_expr").notNull(),
  severity:         text("severity").notNull().default("HARD"),
  action:           text("action").notNull().default("ER_SEND"),
  immediateActions: text("immediate_actions"),
  rationale:        text("rationale"),
  active:           boolean("active").default(true).notNull(),
  createdAt:        timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt:        timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Diagnosis Rules ───────────────────────────────────────────────────────────
export const kbDiagnosisRules = pgTable("kb_diagnosis_rules", {
  id:                  serial("id").primaryKey(),
  ruleId:              text("rule_id").notNull().unique(),
  complaintId:         text("complaint_id").notNull(),
  diagnosisId:         text("diagnosis_id").notNull(),
  diagnosisLabel:      text("diagnosis_label").notNull(),
  icdCode:             text("icd_code"),
  baseProbability:     real("base_probability").default(0.1).notNull(),
  featureLikelihoods:  jsonb("feature_likelihoods").$type<Record<string, number>>().default({}).notNull(),
  cannotMiss:          boolean("cannot_miss").default(false).notNull(),
  basePoints:          integer("base_points").default(1),
  clusterPriority:     integer("cluster_priority").default(50),
});
```


================================================================================
SLICE 2 — AGENT SYSTEM CORE  (server/agents/orchestrator.ts)
================================================================================
Production-grade multi-agent orchestrator. Features:
  1. Topological sort with cycle detection (runs at startup, not per-request)
  2. AbortController-based timeouts — hung agents release resources
  3. Failure cascade — dependent agents skipped when dependencies fail
  4. Per-agent circuit breakers (in-memory; redis layer elsewhere)
  5. P50/P95/P99 latency metrics per agent
  6. Execution fingerprint — SHA-256 of (context, plan) for auditability
================================================================================

```typescript
// server/agents/orchestrator.ts  (full file, 305 lines)

import crypto from "crypto";
import { CircuitBreaker } from "../utils/circuitBreaker";
import { logger }         from "../utils/logger";

export interface AgentContext {
  text:      string;
  patientId?: string;
  answers?:  Record<string, string>;
  channel?:  "web" | "telegram" | "whatsapp";
  metadata?: Record<string, any>;
  signal?:   AbortSignal;   // injected by orchestrator — agents may honour it
}

export interface AgentOutput { [key: string]: any; }

export interface Agent {
  name:       string;
  priority:   number;
  timeoutMs?: number;
  dependsOn?: string[];     // enforced via topological sort
  fallbacks?: string[];     // for adaptive router (future)
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
}

export interface RunAgentsResult {
  results:        Record<string, AgentOutput>;
  errors:         Record<string, string>;
  skipped:        Record<string, string>;   // agentName → skipReason
  executionOrder: string[];
  durationMs:     number;
  metrics:        Record<string, any>;
  fingerprint:    string;
}

// ── Topological sort with cycle detection ─────────────────────────────────────
export function topologicalSort(agents: Agent[]): Agent[] {
  const agentMap   = new Map(agents.map(a => [a.name, a]));
  const visited    = new Set<string>();
  const inProgress = new Set<string>();
  const sorted:    Agent[] = [];

  function visit(name: string, path: string[]): void {
    if (visited.has(name)) return;
    if (inProgress.has(name)) {
      throw new Error(`[Orchestrator] Circular dependency: ${[...path, name].join(" → ")}`);
    }
    const agent = agentMap.get(name);
    if (!agent) throw new Error(`[Orchestrator] Dependency "${name}" is referenced but not registered`);

    inProgress.add(name);
    for (const dep of agent.dependsOn ?? []) visit(dep, [...path, name]);
    inProgress.delete(name);
    visited.add(name);
    sorted.push(agent);
  }

  const byPriority = [...agents].sort((a, b) => a.priority - b.priority);
  for (const agent of byPriority) visit(agent.name, []);
  return sorted;
}

// ── Registry + in-memory metrics ──────────────────────────────────────────────
const _agents: Agent[] = [];
const _agentBreakers = new Map<string, CircuitBreaker>();
function getBreakerForAgent(name: string): CircuitBreaker {
  if (!_agentBreakers.has(name)) {
    _agentBreakers.set(name, new CircuitBreaker(`agent:${name}`, 5, 60_000));
  }
  return _agentBreakers.get(name)!;
}

const _agentMetrics = new Map<string, {
  totalRuns: number; successes: number; failures: number; timeouts: number; latencies: number[];
}>();

function recordMetric(name: string, durationMs: number, outcome: "success"|"failure"|"timeout"): void {
  if (!_agentMetrics.has(name)) {
    _agentMetrics.set(name, { totalRuns: 0, successes: 0, failures: 0, timeouts: 0, latencies: [] });
  }
  const m = _agentMetrics.get(name)!;
  m.totalRuns++;
  if (outcome === "success") m.successes++;
  else if (outcome === "failure") m.failures++;
  else m.timeouts++;
  m.latencies.push(durationMs);
  if (m.latencies.length > 200) m.latencies.shift();
}

function computePercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

let _sortedPlan: Agent[] | null = null;
function getExecutionPlan(): Agent[] {
  if (!_sortedPlan) _sortedPlan = topologicalSort(_agents);
  return _sortedPlan;
}

function generateFingerprint(context: AgentContext, plan: Agent[]): string {
  const payload = JSON.stringify({
    context: { text: context.text, patientId: context.patientId, channel: context.channel },
    plan: plan.map(a => ({ name: a.name, priority: a.priority, dependsOn: a.dependsOn ?? [] })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function registerAgent(agent: Agent): void {
  const existing = _agents.findIndex(a => a.name === agent.name);
  if (existing >= 0) _agents[existing] = agent;
  else _agents.push(agent);
  _sortedPlan = null;
}

export function getAgentMetrics(): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, m] of _agentMetrics.entries()) {
    const breaker = _agentBreakers.get(name);
    result[name] = {
      totalRuns: m.totalRuns, successes: m.successes, failures: m.failures, timeouts: m.timeouts,
      successRate: m.totalRuns > 0 ? Math.round((m.successes / m.totalRuns) * 100) : 100,
      p50Ms: computePercentile(m.latencies, 50),
      p95Ms: computePercentile(m.latencies, 95),
      p99Ms: computePercentile(m.latencies, 99),
      breakerState: breaker ? breaker.getState().state : "closed",
    };
  }
  return result;
}

// ── Main runner ───────────────────────────────────────────────────────────────
export async function runAgents(context: AgentContext): Promise<RunAgentsResult> {
  const results:        Record<string, AgentOutput> = {};
  const errors:         Record<string, string>       = {};
  const skipped:        Record<string, string>       = {};
  const executionOrder: string[]                     = [];
  const start = Date.now();

  const { isAgentEnabled } = await import("./agentConfig");
  const plan        = getExecutionPlan();
  const fingerprint = generateFingerprint(context, plan);
  const skippedDueToFailedDep = new Set<string>();

  for (const agent of plan) {
    if (!isAgentEnabled(agent.name)) {
      executionOrder.push(`${agent.name}:DISABLED`);
      skipped[agent.name] = "feature flag disabled";
      continue;
    }

    const failedDep = (agent.dependsOn ?? []).find(dep => dep in errors || skippedDueToFailedDep.has(dep));
    if (failedDep) {
      skipped[agent.name] = `Dependency "${failedDep}" did not succeed`;
      skippedDueToFailedDep.add(agent.name);
      executionOrder.push(`${agent.name}:SKIPPED_DEP_FAILED`);
      continue;
    }

    const breaker = getBreakerForAgent(agent.name);
    if (breaker.getState().state === "open") {
      skipped[agent.name] = `Circuit breaker open`;
      skippedDueToFailedDep.add(agent.name);
      executionOrder.push(`${agent.name}:CIRCUIT_OPEN`);
      continue;
    }

    const timeoutMs     = agent.timeoutMs ?? 10_000;
    const abortCtrl     = new AbortController();
    const agentStart    = Date.now();
    const timeoutHandle = setTimeout(() => abortCtrl.abort(), timeoutMs);

    try {
      const output = await Promise.race([
        agent.run({ ...context, signal: abortCtrl.signal }, results),
        new Promise<never>((_, reject) => {
          abortCtrl.signal.addEventListener("abort", () =>
            reject(new Error(`Agent "${agent.name}" timed out after ${timeoutMs}ms`))
          );
        }),
      ]);
      clearTimeout(timeoutHandle);
      results[agent.name] = output;
      executionOrder.push(agent.name);
      recordMetric(agent.name, Date.now() - agentStart, "success");
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      abortCtrl.abort();
      errors[agent.name] = err.message || "Unknown agent error";
      executionOrder.push(`${agent.name}:FAILED`);
      recordMetric(agent.name, Date.now() - agentStart, err?.message?.includes("timed out") ? "timeout" : "failure");
    }
  }

  return { results, errors, skipped, executionOrder, durationMs: Date.now() - start, metrics: getAgentMetrics(), fingerprint };
}
```


================================================================================
SLICE 3 — AGENT FLEET ORCHESTRATOR  (server/agents/agentFleetOrchestrator.ts)
================================================================================
Parallel multi-agent fleet: runs N agents simultaneously with different clinical
lenses (e.g. ED triage + ICU severity + pharmacology). Confidence-weighted voting
on diagnosis consensus. Safety override: highest-risk assessment always wins.
Graceful degradation via heuristic fallback when OpenAI is unavailable.
================================================================================

```typescript
// server/agents/agentFleetOrchestrator.ts  (full file, 252 lines)

import OpenAI from "openai";
import { saveArtifact } from "../artifacts/artifactStore";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: key, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  return _openai;
}

export type AgentTaskType = "diagnosis" | "triage" | "treatment" | "risk_score" | "disposition";

export interface AgentTask {
  id:    string;
  type:  AgentTaskType;
  input: Record<string, unknown>;
  model: string;
  role?: string;  // clinical role framing, e.g. "ICU intensivist"
}

export interface AgentOutput {
  diagnosis:       string[];
  confidence:      number;        // 0–1
  reasoning:       string[];
  recommendations?: string[];
  riskLevel?:      "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
}

export interface ConsensusOutput {
  topDiagnoses:   { dx: string; score: number }[];
  avgConfidence:  number;
  agreementRate:  number;         // fraction of agents agreeing on top diagnosis
  recommendation: string;
  riskLevel:      "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
}

// ── Fallback heuristic agent (no AI required) ─────────────────────────────────
function heuristicAgent(task: AgentTask): AgentOutput {
  const vitals = (task.input as any).vitals ?? {};
  const { sbp = 120, hr = 80, rr = 16, temp = 37 } = vitals;
  const sepsisLike = hr > 100 && (rr > 20 || temp > 38 || sbp < 100);
  return {
    diagnosis:    sepsisLike ? ["Sepsis (suspected)", "Systemic inflammatory response"] : ["No acute critical diagnosis"],
    confidence:   sepsisLike ? 0.6 : 0.4,
    reasoning:    [`HR=${hr}, SBP=${sbp}, RR=${rr}, Temp=${temp}`, sepsisLike ? "Meets ≥2 SIRS criteria" : "Vitals acceptable"],
    recommendations: sepsisLike
      ? ["Obtain blood cultures", "Measure lactate", "Start broad-spectrum antibiotics within 1 hour"]
      : ["Continue monitoring", "Reassess in 30 minutes"],
    riskLevel: sepsisLike ? "HIGH" : "LOW",
  };
}

// ── Single agent runner ───────────────────────────────────────────────────────
async function runSingleAgent(task: AgentTask): Promise<AgentTaskResult> {
  const start = Date.now();
  const ai    = getOpenAI();
  if (!ai) {
    const output = heuristicAgent(task);
    return { taskId: task.id, model: task.model, role: task.role ?? "heuristic", output, durationMs: Date.now() - start };
  }
  try {
    const roleText = task.role ?? "clinical reasoning assistant";
    const prompt   = `You are a ${roleText}.
Task: ${task.type}
Clinical Input:
${JSON.stringify(task.input, null, 2)}

Return ONLY valid JSON with this exact structure (no prose, no markdown):
{
  "diagnosis": ["primary diagnosis", "differential 1", "differential 2"],
  "confidence": 0.85,
  "reasoning": ["key finding 1", "key finding 2"],
  "recommendations": ["action 1", "action 2"],
  "riskLevel": "HIGH"
}
riskLevel must be one of: LOW, MODERATE, HIGH, CRITICAL`;

    const res    = await ai.chat.completions.create({
      model: task.model, messages: [{ role: "user", content: prompt }],
      temperature: 0.2, response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}") as AgentOutput;
    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));
    parsed.diagnosis  = Array.isArray(parsed.diagnosis) ? parsed.diagnosis : [];
    parsed.riskLevel  = parsed.riskLevel ?? "LOW";
    return { taskId: task.id, model: task.model, role: task.role ?? task.model, output: parsed, durationMs: Date.now() - start };
  } catch (err: any) {
    return { taskId: task.id, model: task.model, role: task.role ?? task.model,
             output: heuristicAgent(task), durationMs: Date.now() - start, error: err.message };
  }
}

// ── Consensus engine ──────────────────────────────────────────────────────────
// Safety override: highest-risk assessment from any agent wins.
// Diagnosis winner: confidence-weighted vote across all agents.
export function aggregateFleetResults(results: AgentTaskResult[]): ConsensusOutput {
  if (results.length === 0) {
    return { topDiagnoses: [], avgConfidence: 0, agreementRate: 0, recommendation: "Insufficient agent results", riskLevel: "LOW" };
  }

  const dxVotes: Record<string, number> = {};
  let totalConfidence = 0;
  const riskRank = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
  let maxRisk: ConsensusOutput["riskLevel"] = "LOW";

  for (const r of results) {
    totalConfidence += r.output.confidence;
    if (riskRank[r.output.riskLevel ?? "LOW"] > riskRank[maxRisk]) maxRisk = r.output.riskLevel ?? "LOW";
    for (const dx of r.output.diagnosis ?? []) {
      dxVotes[dx] = (dxVotes[dx] ?? 0) + r.output.confidence;
    }
  }

  const topDiagnoses = Object.entries(dxVotes)
    .map(([dx, score]) => ({ dx, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score).slice(0, 5);

  const topDx = topDiagnoses[0]?.dx;
  const agreementRate = topDx ? results.filter(r => r.output.diagnosis?.includes(topDx)).length / results.length : 0;
  const bestResult    = results.sort((a, b) => b.output.confidence - a.output.confidence)[0];

  return {
    topDiagnoses,
    avgConfidence:  Math.round((totalConfidence / results.length) * 100) / 100,
    agreementRate:  Math.round(agreementRate * 100) / 100,
    recommendation: bestResult.output.recommendations?.[0] ?? "Physician review required",
    riskLevel:      maxRisk,
  };
}

// ── Fleet runner ──────────────────────────────────────────────────────────────
export async function runAgentFleet(
  tasks:   AgentTask[],
  options: { saveArtifactOnComplete?: boolean; patientId?: string } = {},
): Promise<AgentFleetResult> {
  const fleetId      = `fleet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const start        = Date.now();
  const taskResults  = await Promise.all(tasks.map(runSingleAgent));
  const consensus    = aggregateFleetResults(taskResults);
  const fleetResult: AgentFleetResult = { fleetId, tasks: taskResults, consensus, durationMs: Date.now() - start };

  if (options.saveArtifactOnComplete) {
    const artifact = await saveArtifact({
      type: "fleet_result", content: fleetResult, agentId: fleetId,
      patientId: options.patientId,
      metadata: { taskCount: tasks.length, models: [...new Set(tasks.map(t => t.model))] },
    });
    fleetResult.artifactId = artifact.id;
  }

  return fleetResult;
}
```


================================================================================
SLICE 4 — RISK AGENT  (server/agents/riskAgent.ts)
================================================================================
Individual risk assessment agent registered with the main orchestrator.
Reads prior diagnosis agent results, classifies risk level, checks safe-discharge
criteria, publishes events on the internal event bus, and logs to audit trail.
================================================================================

```typescript
// server/agents/riskAgent.ts  (full file, 42 lines)

import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { classifyRisk, validateSafeDischarge }   from "../compliance/riskEngine";
import { publish }   from "./eventBus";
import { logAgent }  from "./tracking";

export const riskAgent: Agent = {
  name:     "risk",
  priority: 25,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();

    const dx         = priorResults.diagnosis?.dx;
    const triage     = priorResults.diagnosis?.triage || priorResults.triage?.disposition;
    const confidence = priorResults.diagnosis?.confidence;

    const classification = classifyRisk({ triage, diagnosis: dx, confidence });
    const dischargeCheck = validateSafeDischarge({ triage, diagnosis: dx });

    const result = {
      level:                    classification.level,
      requiresPhysicianReview:  classification.requiresPhysicianReview,
      requiresAuditTrail:       classification.requiresAuditTrail,
      escalationRequired:       classification.escalationRequired,
      reason:                   classification.reason,
      safeDischarge:            dischargeCheck.safe,
      dischargeBlockReason:     dischargeCheck.reason || null,
    };

    if (classification.level === "CRITICAL" || classification.level === "HIGH") {
      publish("risk:elevated", { level: classification.level, dx, triage });
    }
    if (!dischargeCheck.safe) {
      publish("risk:discharge_blocked", { reason: dischargeCheck.reason, dx, triage });
    }

    logAgent("risk", { level: classification.level, safeDischarge: dischargeCheck.safe }, Date.now() - start);
    return result;
  },
};
```


================================================================================
SLICE 5 — BRAIN ORCHESTRATOR  (server/agents/brainOrchestrator.ts)
================================================================================
Unified high-level control loop that wires together ALL reasoning layers:
  Risk Scoring → ICU Decision → Safety Gate → Digital Twin → Routing → Audit
Includes autonomous loop (runs every 4 sec, generates 3-5 patients per cycle),
patient simulator (8% critical rate, 25% abnormal), insight generator.
================================================================================

```typescript
// server/agents/brainOrchestrator.ts  (full file, 332 lines)

import { logEvent }              from "../audit/hashChain";
import { runDigitalTwin }        from "../simulation/digitalTwinEngine";
import { broadcastPatientEvent } from "../ws/patientStream";

// ── Patient vitals ────────────────────────────────────────────────────────────
export interface PatientVitals {
  patientId: string;
  name?:     string;
  hr:   number;  // bpm
  spo2: number;  // %
  temp: number;  // °F
  sbp:  number;  // systolic BP mmHg
  dbp:  number;  // diastolic BP mmHg
  rr:   number;  // respiratory rate /min
  complaint?: string;
  ts:   number;
}

// ── Risk scoring (rule-based, no LLM required) ────────────────────────────────
export function scoreRisk(v: PatientVitals): RiskResult {
  let score = 0;
  const flags: string[] = [];

  if      (v.spo2 < 88)  { score += 0.45; flags.push("SpO2 critically low"); }
  else if (v.spo2 < 92)  { score += 0.25; flags.push("SpO2 low"); }

  if      (v.hr > 130)   { score += 0.30; flags.push("Tachycardia severe"); }
  else if (v.hr > 110)   { score += 0.15; flags.push("Tachycardia"); }
  else if (v.hr < 45)    { score += 0.25; flags.push("Bradycardia"); }

  if      (v.temp > 103) { score += 0.20; flags.push("Fever high"); }
  else if (v.temp > 101) { score += 0.10; flags.push("Fever"); }
  else if (v.temp < 96)  { score += 0.20; flags.push("Hypothermia"); }

  if      (v.sbp < 90)   { score += 0.35; flags.push("Hypotension critical"); }
  else if (v.sbp < 100)  { score += 0.15; flags.push("Hypotension"); }
  else if (v.sbp > 180)  { score += 0.20; flags.push("Hypertensive crisis"); }

  if      (v.rr > 28)    { score += 0.20; flags.push("Respiratory distress"); }
  else if (v.rr < 8)     { score += 0.30; flags.push("Respiratory depression"); }

  score = Math.min(1, score);
  const level =
    score >= 0.80 ? "CRITICAL" :
    score >= 0.55 ? "HIGH"     :
    score >= 0.30 ? "MODERATE" : "LOW";

  return { score, level, flags };
}

// ── ICU decision ──────────────────────────────────────────────────────────────
export function icuDecision(risk: RiskResult): ICUDecision {
  if (risk.level === "CRITICAL") return { needsICU: true,  needsPhysician: true,  urgency: "immediate", reason: "Critical risk — ICU transfer required immediately" };
  if (risk.level === "HIGH")     return { needsICU: false, needsPhysician: true,  urgency: "urgent",    reason: "High risk — physician review within 15 minutes" };
  if (risk.level === "MODERATE") return { needsICU: false, needsPhysician: false, urgency: "routine",   reason: "Moderate risk — standard monitoring" };
  return                                { needsICU: false, needsPhysician: false, urgency: "monitor",   reason: "Low risk — routine monitoring" };
}

// ── Safety gate ───────────────────────────────────────────────────────────────
export function safetyGate(icu: ICUDecision, risk: RiskResult): SafetyGateResult {
  if (icu.needsICU)      return { allowed: false, requiresApproval: true, blockedReason: "ICU transfer requires physician co-signature" };
  if (risk.score > 0.85) return { allowed: false, requiresApproval: true, blockedReason: "Risk score above safety threshold — physician override required" };
  return { allowed: true, requiresApproval: false };
}

// ── Routing suggestion ────────────────────────────────────────────────────────
export function suggestRoute(risk: RiskResult, icu: ICUDecision): RoutingResult {
  if (icu.needsICU)             return { destination: "ICU",     urgency: "immediate", reason: "Critical deterioration — direct ICU admission", alternateHospitals: ["Bellevue Hospital", "NYC Health + Hospitals/Harlem"] };
  if (icu.urgency === "urgent") return { destination: "ER",      urgency: "urgent",    reason: "High acuity — Emergency evaluation required" };
  if (risk.level === "MODERATE") return { destination: "CLINIC", urgency: "routine",   reason: "Moderate acuity — clinic evaluation same day" };
  return                               { destination: "MONITOR", urgency: "routine",   reason: "Low acuity — vitals monitoring, discharge if stable" };
}

// ── Full agent cycle ──────────────────────────────────────────────────────────
// Runs synchronously in < 2ms (no LLM calls). Logs to immutable audit chain.
// Broadcasts result to all WebSocket subscribers via /ws/patient-stream.
export async function runAgentCycle(vitals: PatientVitals): Promise<AgentCycleResult> {
  const start    = Date.now();
  const risk     = scoreRisk(vitals);
  const icu      = icuDecision(risk);
  const safety   = safetyGate(icu, risk);
  const twin     = runDigitalTwin({ result: { trajectory: { riskScore: risk.score } } });
  const routing  = suggestRoute(risk, icu);
  const insights = generateInsights(vitals, risk, icu);

  const entry    = logEvent({ patientId: vitals.patientId, risk: { level: risk.level, score: risk.score },
                               icu: { needsICU: icu.needsICU, urgency: icu.urgency },
                               safety: { allowed: safety.allowed }, routing: { destination: routing.destination }, ts: Date.now() });

  const result = { patientId: vitals.patientId, vitals, risk, icu, safety, twin, routing, insights,
                   auditHash: entry.hash, durationMs: Date.now() - start, ts: Date.now() };

  broadcastPatientEvent({ type: "agent_cycle", ...result });
  return result;
}

// ── Autonomous loop ───────────────────────────────────────────────────────────
// Runs 3-5 patients every 4 seconds. Stores last 20 results and 50 insights.
let loopState: LoopState = {
  running: false, cycleCount: 0, lastCycleMs: null, startedAt: null,
  errors: 0, recentResults: [], recentInsights: [],
};
let loopTimer: ReturnType<typeof setTimeout> | null = null;

async function runLoopCycle() {
  if (!loopState.running) return;
  try {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const vitals = generateSimulatedPatient(i);
      const result = await runAgentCycle(vitals);
      loopState.recentResults  = [result, ...loopState.recentResults].slice(0, 20);
      loopState.recentInsights = [...result.insights, ...loopState.recentInsights]
        .filter(ins => ins.priority !== "INFO" || loopState.recentInsights.length < 10)
        .slice(0, 50);
    }
    loopState.cycleCount++;
    loopState.lastCycleMs = Date.now();
  } catch (e: any) {
    loopState.errors++;
  }
  if (loopState.running) loopTimer = setTimeout(runLoopCycle, 4000);
}

export function startLoop() {
  if (loopState.running) return { started: false, message: "Loop already running" };
  loopState.running   = true;
  loopState.startedAt = Date.now();
  loopTimer = setTimeout(runLoopCycle, 100);
  return { started: true, message: "Autonomous agent loop started" };
}

export function stopLoop() {
  if (!loopState.running) return { stopped: false, message: "Loop not running" };
  loopState.running = false;
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  return { stopped: true, message: "Loop stopped" };
}
```


================================================================================
SLICE 6 — AUDIT HASH CHAIN  (server/audit/hashChain.ts)
================================================================================
Tamper-evident append-only audit chain.
  - Full recursive canonicalization (key-order independent, timing-safe compare)
  - In-memory chain with configurable max size (500 entries)
  - logEvent() / getAuditChain() / getChainHead() public API
  - Genesis hash seeded from all-zeros (HIPAA compliance marker)
================================================================================

```typescript
// server/audit/hashChain.ts  (full file, 135 lines)

import crypto from "crypto";

// ── Fully recursive canonicalization ──────────────────────────────────────────
// JSON.stringify is insertion-order dependent — silently breaks hash chain on
// objects built in different orders. This recursive version sorts all keys.
function canonicalize(value: unknown, inArray = false): string {
  if (value === null) return "null";
  if (value === undefined) return inArray ? "null" : "";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(v => canonicalize(v, true)).join(",") + "]";
  if (t === "object") {
    const obj  = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k], false)).join(",") + "}";
  }
  return JSON.stringify(String(value));
}

export function stableStringify(value: unknown): string { return canonicalize(value, false); }

// ── Hash computation (pure — no side effects) ─────────────────────────────────
export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(prevHash + stableStringify(entry), "utf8").digest("hex");
}

// ── Link verification (timing-safe) ──────────────────────────────────────────
// Three safety layers:
//   1. Hex-format guard — rejects malformed inputs before any buffer ops
//   2. Length guard     — timingSafeEqual requires equal-length buffers
//   3. Constant-time compare — prevents timing oracle attacks
export function verifyChainLink(entry: Record<string, unknown>, prevHash: string, claimedHash: string): boolean {
  try {
    if (!/^[a-f0-9]{64}$/i.test(claimedHash)) return false;
    const expected    = computeChainHash(prevHash, entry);
    const expectedBuf = Buffer.from(expected, "hex");
    const claimedBuf  = Buffer.from(claimedHash, "hex");
    if (expectedBuf.length !== claimedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, claimedBuf);
  } catch { return false; }
}

// ── In-memory append-only chain ───────────────────────────────────────────────
export interface AuditEntry {
  hash:     string;
  prevHash: string;
  ts:       number;
  [key: string]: unknown;
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const MAX_CHAIN    = 500;

let auditChain: AuditEntry[] = [];
let chainHead  = GENESIS_HASH;

export function logEvent(data: Record<string, unknown>): AuditEntry {
  const entry  = { ...data, ts: data.ts ?? Date.now() };
  const hash   = computeChainHash(chainHead, entry);
  const stored = { ...entry, hash, prevHash: chainHead } as AuditEntry;
  auditChain.push(stored);
  if (auditChain.length > MAX_CHAIN) auditChain = auditChain.slice(-MAX_CHAIN);
  chainHead = hash;
  return stored;
}

export function getAuditChain(): AuditEntry[] { return [...auditChain]; }
export function getChainHead():  string        { return chainHead; }
```


================================================================================
SLICE 7 — DIGITAL TWIN ENGINE  (server/simulation/digitalTwinEngine.ts)
================================================================================
Runs 3 what-if scenarios (No Action / Immediate Treatment / Delayed Care 4-6h)
from a base risk score. Deterministic, no LLM required.
================================================================================

```typescript
// server/simulation/digitalTwinEngine.ts  (full file, 25 lines)

export interface SimulationScenario {
  scenario:       string;
  intervention:   "none" | "treatment" | "delay";
  riskScore:      number;
  outcome:        string;
  timeToEvent:    string;
  recommendation: string;
}

export function runDigitalTwin(params: { result: any }): SimulationScenario[] {
  const baseRisk = params.result.trajectory?.riskScore ?? params.result.uncertainty ?? 0.35;

  const calc = (delta: number) => {
    const r       = Math.max(0, Math.min(1, baseRisk + delta));
    const outcome = r > 0.75 ? "High likelihood of deterioration" :
                    r > 0.50 ? "Moderate risk — close monitoring needed" :
                    r > 0.30 ? "Low-moderate risk — watchful waiting" : "Low risk — stable";
    const time    = r > 0.75 ? "< 2 hours" : r > 0.50 ? "2-12 hours" : r > 0.30 ? "12-48 hours" : "stable";
    return { riskScore: Math.round(r * 1000) / 1000, outcome, timeToEvent: time };
  };

  return [
    { scenario: "No Action",          intervention: "none",      ...calc(+0.25), recommendation: "Do not delay — deterioration likely without intervention" },
    { scenario: "Immediate Treatment", intervention: "treatment", ...calc(-0.28), recommendation: "Initiate treatment now for best outcome trajectory" },
    { scenario: "Delayed Care (4-6h)", intervention: "delay",    ...calc(+0.38), recommendation: "Avoid delay — 4-6 hour lag substantially worsens prognosis" },
  ];
}
```


================================================================================
SLICE 8 — HOSPITAL ROUTING ENGINE  (server/hospital/routingEngine.ts)
================================================================================
Capacity-aware, surge-aware patient routing with 7-level priority hierarchy.
Every decision recorded with human-readable audit reason.
================================================================================

```typescript
// server/hospital/routingEngine.ts  (full file, 93 lines)

export interface RoutingInput {
  patient: {
    patientId:          string;
    complaint:          string;
    symptoms:           string[];
    safetyDisposition?: "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
  };
  deterioration: { score: number; riskLevel: string; predictedNeedForEscalation: boolean };
  capacityState: { canAbsorbMoreTelemed: boolean; canAbsorbMoreClinic: boolean; systemState: string };
  surgeState:    { status: string };
}

export type RouteDestination = "ER" | "CLINIC" | "TELEMED" | "HOME";

export function routePatientAcrossSystem(input: RoutingInput): PatientPlan {
  const safety = input.patient.safetyDisposition ?? "CONTINUE";

  // Priority 1 — Safety hard stop (ER_NOW) — cannot be overridden by anything
  if (safety === "ER_NOW")
    return plan(input, "ER", "immediate", "Safety pipeline hard stop — ER_NOW cannot be overridden");

  // Priority 2 — High deterioration risk → must be seen in person
  if (input.deterioration.riskLevel === "high")
    return plan(input, "CLINIC", "urgent", "High deterioration risk — requires in-person physician evaluation");

  // Priority 3 — URGENT disposition, route to clinic or ER based on capacity
  if (safety === "URGENT") {
    const dest = input.capacityState.canAbsorbMoreClinic ? "CLINIC" : "ER";
    return plan(input, dest, "urgent", "Urgent safety disposition with capacity-aware routing");
  }

  // Priority 4 — Critical surge: divert low-acuity to telemed to protect ER
  if (input.surgeState.status === "critical" && input.capacityState.canAbsorbMoreTelemed)
    return plan(input, "TELEMED", "routine", "Critical surge — low-acuity diversion to telemed");

  // Priority 5 — Routine: telemed preferred
  if (input.capacityState.canAbsorbMoreTelemed)
    return plan(input, "TELEMED", "routine", "Appropriate low/medium-acuity telemed route");

  // Priority 6 — Telemed at capacity, clinic available
  if (input.capacityState.canAbsorbMoreClinic)
    return plan(input, "CLINIC", "routine", "Telemed at capacity — clinic slot available");

  // Priority 7 — All capacity constrained: home care + callback queue
  return plan(input, "HOME", "routine", "All in-person and virtual capacity constrained — home care with scheduled callback");
}
```


================================================================================
SLICE 9 — WEBSOCKET PATIENT STREAM  (server/ws/patientStream.ts)
================================================================================
Lightweight broadcast WebSocket at /ws/patient-stream.
Receives agent cycle results from brainOrchestrator.broadcastPatientEvent().
Frontend subscribes for live ICU-style event feed.
================================================================================

```typescript
// server/ws/patientStream.ts  (full file, 24 lines)

import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

let wss: WebSocketServer | null = null;

export function startPatientStreamSocket(server: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server, path: "/ws/patient-stream" });
  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    ws.on("error", () => {});
  });
}

export function broadcastPatientEvent(payload: object) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}
```


================================================================================
SLICE 10 — AGENT BRAIN API ROUTES  (server/routes/agentBrainRoutes.ts)
================================================================================
8 REST endpoints for the Agentic Brain system. Thin — all logic in
brainOrchestrator. No auth middleware on this file (inherited from app-level).
================================================================================

```typescript
// server/routes/agentBrainRoutes.ts  (full file, 167 lines)

import { Router } from "express";
import {
  runAgentCycle, generateSimulatedPatient,
  startLoop, stopLoop, getLoopState,
  scoreRisk, generateInsights, icuDecision,
  type PatientVitals,
} from "../agents/brainOrchestrator";
import { getAuditChain } from "../audit/hashChain";

const router = Router();

// GET  /api/agent-brain/status       — loop running state, cycle count, error count
// GET  /api/agent-brain/heatmap      — deduplicated patient list with vitals, risk, routing
// GET  /api/agent-brain/insights     — prioritised alert feed (CRITICAL → INFO)
// GET  /api/agent-brain/cycle-results — last 10 cycle summaries with audit hash
// GET  /api/agent-brain/audit        — last 20 audit chain entries (truncated hashes)
// POST /api/agent-brain/loop/start   — start autonomous 4s loop
// POST /api/agent-brain/loop/stop    — stop loop
// POST /api/agent-brain/cycle        — run one manual cycle (accepts custom vitals body)
// POST /api/agent-brain/simulate     — run only the twin simulation + risk (no loop state)

router.get("/status", (_req, res) => {
  const state = getLoopState();
  res.json({ ok: true, running: state.running, cycleCount: state.cycleCount,
             lastCycleMs: state.lastCycleMs, startedAt: state.startedAt,
             errors: state.errors, patientCount: state.recentResults.length });
});

router.get("/heatmap", (_req, res) => {
  const state = getLoopState();
  const seen  = new Set<string>();
  const patients = state.recentResults
    .filter(r => { if (seen.has(r.patientId)) return false; seen.add(r.patientId); return true; })
    .map(r => ({ patientId: r.patientId, name: r.vitals.name, riskScore: r.risk.score,
                 riskLevel: r.risk.level, flags: r.risk.flags, destination: r.routing.destination,
                 urgency: r.routing.urgency, icu: r.icu.needsICU, ts: r.ts,
                 vitals: { hr: r.vitals.hr, spo2: r.vitals.spo2, temp: r.vitals.temp,
                           sbp: r.vitals.sbp, rr: r.vitals.rr } }));
  res.json({ ok: true, patients, total: patients.length });
});

router.get("/audit", (_req, res) => {
  const chain  = getAuditChain();
  const recent = chain.slice(-20).reverse().map(e => ({
    hash: e.hash.slice(0, 12), prevHash: e.prevHash.slice(0, 12),
    patientId: e.patientId, risk: e.risk, ts: e.ts,
  }));
  res.json({ ok: true, entries: recent, totalEvents: chain.length });
});

router.post("/cycle", async (req, res) => {
  try {
    const vitals: PatientVitals = req.body?.vitals ?? generateSimulatedPatient();
    const result = await runAgentCycle(vitals);
    res.json({ ok: true, patientId: result.patientId, risk: result.risk, icu: result.icu,
               safety: result.safety, twin: result.twin, routing: result.routing,
               insights: result.insights, auditHash: result.auditHash, durationMs: result.durationMs });
  } catch (e: any) { res.status(500).json({ ok: false, error: e?.message }); }
});

export default router;
```


================================================================================
SLICE 11 — AI OPS ASSISTANT  (server/routes/ops.ts)
================================================================================
Collects live operational context (queue health, research pipeline,
agent handoffs, DB/Redis status) and feeds it to GPT-4o as a real-time
system prompt. Supports 6-turn conversation history.
================================================================================

```typescript
// server/routes/ops.ts  (full file, 203 lines)

import { Router } from "express";
import OpenAI from "openai";
import { getAllQueueHealth }             from "../queue/queueHealth";
import { testDbConnection, db }         from "../db";
import { getRedisAsync }                from "../queue/redis";
import { researchArticles, researchReviews, agentHandoffs } from "../../shared/schema";
import { sql, count } from "drizzle-orm";

const router = Router();

// ── GET /api/ops/summary ──────────────────────────────────────────────────────
// System health dashboard: DB, Redis, queues, events, jobs, metrics
router.get("/summary", async (_req, res) => {
  let database = { ok: false, error: undefined as string|undefined };
  let redis    = { ok: false, configured: false, error: undefined as string|undefined };

  try { await testDbConnection(); database.ok = true; }
  catch (err: any) { database.error = err?.message || "DB failure"; }

  // Redis check with isolated timeout (won't block if unreachable)
  try {
    const client = await Promise.race([getRedisAsync(), new Promise<null>(r => setTimeout(() => r(null), 3000))]);
    if (client) {
      redis.configured = true;
      const pong = await Promise.race([client.ping(), new Promise<string>(r => setTimeout(() => r("TIMEOUT"), 2000))]);
      redis.ok = typeof pong === "string" && pong.toUpperCase() === "PONG";
    } else { redis.configured = false; redis.ok = true; }
  } catch {}

  const [queues, events, jobs, metrics] = await Promise.allSettled([
    getAllQueueHealth(), listSystemEvents(20), listRecentJobs(undefined, 20), listRecentMetricSnapshots(undefined, 50)
  ]);
  res.json({ services: { api: { ok: true }, database, redis },
             queues:      queues.status      === "fulfilled" ? queues.value      : {},
             recentEvents: events.status     === "fulfilled" ? events.value      : [],
             recentJobs:   jobs.status       === "fulfilled" ? jobs.value        : [],
             recentMetrics: metrics.status   === "fulfilled" ? metrics.value     : [] });
});

// ── POST /api/ops/ask — AI Ops Assistant ──────────────────────────────────────
// Gathers live context in parallel, builds a structured system prompt,
// then streams GPT-4o response with 6-turn conversation history.
router.post("/ask", async (req, res) => {
  const { question, history = [] } = req.body ?? {};
  if (!question || typeof question !== "string")
    return res.status(400).json({ error: "question is required" });

  const [queueResult, articleCountResult, handoffCountResult, dbResult] = await Promise.allSettled([
    getAllQueueHealth(),
    db.select({ verdict: researchReviews.verdict, cnt: count() })
      .from(researchReviews).groupBy(researchReviews.verdict),
    db.select({ status: agentHandoffs.pipelineStatus, cnt: count() })
      .from(agentHandoffs).groupBy(agentHandoffs.pipelineStatus),
    testDbConnection().then(() => true).catch(() => false),
  ]);

  const queues      = queueResult.status      === "fulfilled" ? queueResult.value      : {};
  const articleRows = articleCountResult.status === "fulfilled" ? articleCountResult.value : [];
  const handoffRows = handoffCountResult.status === "fulfilled" ? handoffCountResult.value : [];
  const dbOk        = dbResult.status         === "fulfilled" ? dbResult.value         : false;

  const totalArticles  = articleRows.reduce((s, r) => s + Number(r.cnt), 0);
  const totalHandoffs  = handoffRows.reduce((s, r) => s + Number(r.cnt), 0);
  const pendingApproval = handoffRows.find(r => r.status === "awaiting_approval")?.cnt ?? 0;
  const failedHandoffs  = handoffRows.find(r => r.status === "failed")?.cnt ?? 0;

  const context = `AURALYN REAL-TIME OPERATIONS SNAPSHOT — ${new Date().toISOString()}

SYSTEM HEALTH
  • Database: ${dbOk ? "OK" : "DEGRADED"}

QUEUE HEALTH
${Object.entries(queues).map(([n, q]: any) =>
  `  • ${n}: ${q?.waiting ?? 0} waiting, ${q?.active ?? 0} active, ${q?.completed ?? 0} completed, ${q?.failed ?? 0} failed`
).join("\n") || "  • No queue data"}

RESEARCH PIPELINE  (total: ${totalArticles} articles)
${articleRows.map(r => `  • ${r.verdict ?? "unreviewed"}: ${r.cnt}`).join("\n") || "  • None"}

AGENT HANDOFF QUEUE  (total: ${totalHandoffs})
  Pending physician approval: ${pendingApproval}
  Failed pipelines:            ${failedHandoffs}
${handoffRows.map(r => `  • ${r.status ?? "unknown"}: ${r.cnt}`).join("\n") || "  • None"}

KEY ATTENTION ITEMS
${Number(pendingApproval) > 0 ? `  ⚠ ${pendingApproval} handoff(s) awaiting approval` : "  ✓ No handoffs pending"}
${Number(failedHandoffs)  > 0 ? `  ⚠ ${failedHandoffs} pipeline failure(s) — check logs` : "  ✓ No pipeline failures"}`.trim();

  const openai = new OpenAI({
    apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const messages = [
    { role: "system" as const, content: `You are Auralyn Ops AI — intelligent clinical ops assistant for a 500+ patient/day NYC urgent care.
Answer the physician's operational questions. Be concise, lead with what matters most.
Highlight items needing immediate attention. Never hallucinate — say so if data is unavailable.
Current live context:\n---\n${context}\n---` },
    ...((Array.isArray(history) ? history : []) as Array<{ role: string; content: string }>)
       .slice(-6).filter(m => m.role === "user" || m.role === "assistant")
       .map(m => ({ role: m.role as "user"|"assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o", messages, max_tokens: 600, temperature: 0.3,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  res.json({ ok: true, answer, context: { totalArticles, totalHandoffs, pendingApproval, failedHandoffs } });
});

export default router;
```


================================================================================
SLICE 12 — FRONTEND: AUTH LAYER  (client/src/context/AuthContext.tsx)
================================================================================
React context providing login/logout, token storage in localStorage,
authFetch wrapper, and role-based user object.
================================================================================

```typescript
// client/src/context/AuthContext.tsx  (full file, 83 lines)

import { createContext, useContext, useMemo, useState } from "react";

type AuthUser = {
  userId:         string;
  email?:         string;
  displayName?:   string;
  role:           "admin" | "physician" | "staff" | "patient";
  organizationId?: string;
  isActive:       boolean;
};

const TOKEN_KEY = "app_auth_token";
const USER_KEY  = "app_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user,  setUser]  = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, password: string) {
    const res  = await fetch("/api/roleAuth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
  }

  function logout() {
    setToken(null); setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Wraps fetch with Bearer token — use for all authenticated API calls
  const authFetch: typeof fetch = (input, init = {}) => {
    const headers = new Headers((init as RequestInit).headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input as RequestInfo, { ...(init as RequestInit), headers });
  };

  return (
    <AuthContext.Provider value={useMemo(() => ({ user, token, loading, login, logout, authFetch }), [user, token])}>
      {children}
    </AuthContext.Provider>
  );
}
```


================================================================================
SLICE 13 — FRONTEND: API CLIENT  (client/src/lib/queryClient.ts)
================================================================================
TanStack Query v5 client. Auto-injects auth token and correlation ID on
every request. Default queryFn handles 401 as configurable behavior.
================================================================================

```typescript
// client/src/lib/queryClient.ts  (full file, 72 lines)

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getOrCreateCorrelationId }   from "./correlation";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "x-correlation-id": getOrCreateCorrelationId(),
  };
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: { ...getAuthHeaders(), ...(data ? { "Content-Type": "application/json" } : {}) },
    body:    data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401 }) => async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include", headers: getAuthHeaders(),
    });
    if (on401 === "returnNull" && res.status === 401) return null;
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries:   { queryFn: getQueryFn({ on401: "throw" }), refetchInterval: false,
                 refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
    mutations: { retry: false },
  },
});
```


================================================================================
SLICE 14 — FRONTEND: AGENTIC BRAIN DASHBOARD  (client/src/pages/AgentBrainPage.tsx)
================================================================================
Full-screen 3-pane ICU-style command center (713 lines).
  Left:   Patient risk heatmap — colour-coded cards, sorted by severity
  Center: Selected patient — 5-stage agent pipeline + Digital Twin what-if + routing
  Right:  Insights feed + Audit chain + WebSocket live stream
Controls: Loop start/stop, manual cycle trigger, live status indicators
================================================================================

```typescript
// client/src/pages/AgentBrainPage.tsx  (full file, 713 lines)
// Key patterns shown below — full file above

// ── Data polling ──────────────────────────────────────────────────────────────
const { data: statusData  } = useQuery<any>({ queryKey: ["/api/agent-brain/status"],  refetchInterval: 2000 });
const { data: heatmapData } = useQuery<...>({ queryKey: ["/api/agent-brain/heatmap"], refetchInterval: 3000 });
const { data: insightsData} = useQuery<...>({ queryKey: ["/api/agent-brain/insights"],refetchInterval: 3000 });
const { data: auditData   } = useQuery<...>({ queryKey: ["/api/agent-brain/audit"],   refetchInterval: 5000 });

// ── WebSocket reconnection pattern ────────────────────────────────────────────
const connectWS = useCallback(() => {
  if (wsRef.current?.readyState === WebSocket.OPEN) return;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/patient-stream`);
  ws.onopen    = () => setWsEvents(e => [`✓ Connected at ${new Date().toLocaleTimeString()}`, ...e].slice(0, 50));
  ws.onmessage = ev => {
    const d = JSON.parse(ev.data);
    if (d.type === "agent_cycle") setWsEvents(e => [`[${new Date().toLocaleTimeString()}] ${d.patientId} → ${d.risk?.level}`, ...e].slice(0, 50));
  };
  ws.onclose   = () => setTimeout(connectWS, 3000);  // auto-reconnect
  wsRef.current = ws;
}, []);

// ── Risk colour system ────────────────────────────────────────────────────────
// CRITICAL → red  |  HIGH → orange  |  MODERATE → yellow  |  LOW → emerald
// Applied consistently to: patient cards, pipeline stages, audit entries, insights

// ── Auto-selection ────────────────────────────────────────────────────────────
// When heatmap updates, auto-select the highest-priority patient (CRITICAL > HIGH > first)
useEffect(() => {
  if (!selectedPatient && heatmapData?.patients?.length) {
    const priority = heatmapData.patients.find(p => p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH");
    setSelectedPatient(priority ?? heatmapData.patients[0]);
  }
}, [heatmapData, selectedPatient]);

// ── Layout ────────────────────────────────────────────────────────────────────
// <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
//   Header: loop status + stats + controls
//   Body: grid-cols-[260px_1fr_280px]
//     Left:   ScrollArea of PatientHeatCard[]
//     Center: Patient banner → Pipeline (5 stages) → Digital Twin + Flags/Routing/Safety
//     Right:  Insights ScrollArea → Audit ScrollArea → WS feed ScrollArea
```


================================================================================
SLICE 15 — SYSTEM SUMMARY & KNOWN GAPS
================================================================================

ARCHITECTURE OVERVIEW
  • Stack:        Express 5 + TypeScript / React 18 + Vite / PostgreSQL + Redis (BullMQ)
  • Auth:         JWT, Bearer token in localStorage, Role-based (admin/physician/staff/patient)
  • Multi-tenant: clinicSites + clinicExternalId isolation
  • Real-time:    WebSocket at /ws/patient-stream (broadcast only, no per-user rooms)
  • Audit:        SHA-256 hash chain (in-memory, 500-entry cap, resets on restart)
  • Agents:       ~50 registered agents, topological-sort ordered, circuit-breaker protected
  • Clinical:     GPT-4o fleet + rule-based risk scoring + digital twin + routing engine
  • Research:     Medium RSS → OpenAI triage → Claude safety → human approval pipeline
  • Learning:     RLHF-style physician feedback loop with governance gate

KEY DESIGN DECISIONS TO REVIEW
  1. Hash chain is in-memory only — not persisted to DB between restarts
     → Existing auditLogs table exists in schema but is unused by this chain
  2. brainOrchestrator.ts uses rule-based risk scoring (no LLM) for speed
     → agentFleetOrchestrator.ts uses GPT-4o for diagnosis — these are separate systems not yet bridged
  3. WebSocket broadcasts the entire cycle result (including vitals) — PHI exposure risk
  4. Auth token stored in localStorage — XSS vulnerability
  5. Loop stores state in module-level variables — resets on server restart
  6. 500+ patients/day load test against the 4-second cycle hasn't been formally benchmarked

QUESTIONS FOR CHATGPT REVIEW
  • How should the hash chain be persisted across restarts without breaking the chain on recovery?
  • What's the best pattern to bridge brainOrchestrator (rule-based) with agentFleetOrchestrator (LLM)?
  • How should PHI be scrubbed from WebSocket broadcasts for HIPAA?
  • Should we move auth tokens from localStorage to HttpOnly cookies?
  • How should the autonomous loop state survive server restarts?
  • What security hardening is missing from the /api/agent-brain routes?
  • Are the risk scoring thresholds (spo2 <92 = +0.25 score) clinically appropriate?
  • How should the digital twin be extended to use real patient trajectory data?
================================================================================
