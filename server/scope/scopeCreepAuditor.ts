/**
 * Scope Creep Auditor
 *
 * Article — "Agent Scope Is the Concept That Defines Modern AI Systems":
 *   "Most failures don't happen because scope is missing. They happen because
 *   scope expands quietly over time. 'Just give it broader access' / 'It needs
 *   this to work better' / 'We'll restrict it later.' You won't. And suddenly
 *   your agent accesses too much data, performs unintended actions, becomes
 *   impossible to reason about. This is called scope creep."
 *
 *   Best practice #2: "Start With Minimal Permissions — Give the least access
 *   required. Expand only when necessary."
 *
 *   Best practice #4: "Log Everything — Every action. Every decision. If
 *   something goes wrong, you need traceability."
 *
 * What's already present:
 *   - agentScopeEngine.ts — defines what agents ARE PERMITTED to do
 *   - scopeController.ts  — evaluates and logs scope decisions in real-time
 *   - auditMiddleware.ts  — HTTP-level audit logging
 *
 * What's missing:
 *   Nothing in the system compares what an agent was GRANTED vs. what it
 *   ACTUALLY USED. Without this comparison:
 *     - A triage_agent granted 10 actions but only ever uses 3 has 7 excess
 *       permissions that represent unnecessary attack surface.
 *     - A learning_agent granted modify:weights but that never gets called
 *       should have that permission revoked.
 *   This is exactly how scope creep accumulates — one "just in case" permission
 *   at a time, never audited, never removed.
 *
 * This module:
 *   1. Records every actual permission USE per agent per session
 *   2. Compares used vs. granted to find excess permissions
 *   3. Generates minimal-permission recommendations
 *   4. Detects new permissions appearing (scope expansion events)
 *   5. Scores creep severity: 0 (clean) to 1 (critical over-provisioned)
 */

import { randomUUID } from "crypto";
import { MEDICAL_SCOPE_RULES, type ScopeRule } from "./agentScopeEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  sessionId:  string;
  agentRole:  string;
  action:     string;
  usedAt:     string;
  outcome:    "allowed" | "blocked" | "override";
  context?:   Record<string, unknown>;
}

export interface SessionUsageSummary {
  sessionId:    string;
  agentRole:    string;
  usedActions:  Set<string>;
  blockedActions:Set<string>;
  recordCount:  number;
  startedAt:    string;
  lastSeenAt:   string;
}

export interface CreepReport {
  agentRole:        string;
  granted:          string[];      // all express permissions granted
  implied:          string[];      // implied permissions granted
  denied:           string[];      // explicitly denied
  usedActions:      string[];      // what was actually used (observed)
  unusedGranted:    string[];      // granted but never used → removal candidates
  usedButImplied:   string[];      // used via implied authority (risk: explicit grant may not be needed)
  newActions:       string[];      // actions used that aren't in any granted set (anomaly)
  creepScore:       number;        // 0–1 (0 = clean, 1 = severe over-provisioning)
  recommendation:   string;        // plain-English recommendation
  sessions:         number;
  observationPeriod:string;        // ISO date range
}

export interface ScopeExpansionEvent {
  eventId:      string;
  agentRole:    string;
  action:       string;
  detectedAt:   string;
  type:         "new_action" | "scope_escalation" | "denial_bypass";
  severity:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  details:      string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const usageLog:           UsageRecord[]         = [];
const sessionIndex:       Map<string, SessionUsageSummary> = new Map();
const expansionEvents:    ScopeExpansionEvent[] = [];

const MAX_USAGE_RECORDS   = 50_000;
const MAX_EXPANSION_EVENTS= 1_000;

// ── Recording API ─────────────────────────────────────────────────────────────

/** Record a permission use. Call this from scopeController after every evaluation. */
export function recordUsage(
  sessionId: string,
  agentRole: string,
  action:    string,
  outcome:   UsageRecord["outcome"],
  context?:  Record<string, unknown>
): void {
  const record: UsageRecord = {
    sessionId, agentRole, action, outcome,
    usedAt: new Date().toISOString(), context,
  };

  if (usageLog.length >= MAX_USAGE_RECORDS) usageLog.shift();
  usageLog.push(record);

  // Update session index
  const key = `${sessionId}:${agentRole}`;
  const session = sessionIndex.get(key) ?? {
    sessionId, agentRole,
    usedActions:   new Set<string>(),
    blockedActions:new Set<string>(),
    recordCount:   0,
    startedAt:     record.usedAt,
    lastSeenAt:    record.usedAt,
  };
  if (outcome === "allowed" || outcome === "override") {
    session.usedActions.add(action);
  } else {
    session.blockedActions.add(action);
  }
  session.recordCount++;
  session.lastSeenAt = record.usedAt;
  sessionIndex.set(key, session);

  // Detect scope expansion events
  detectExpansion(agentRole, action, outcome);
}

// ── Expansion detector ────────────────────────────────────────────────────────

function detectExpansion(agentRole: string, action: string, outcome: UsageRecord["outcome"]): void {
  const rule = MEDICAL_SCOPE_RULES.find((r) => r.role === agentRole);
  if (!rule) return;

  const allGranted = new Set([...(rule.express ?? []), ...(rule.implied ?? [])]);
  const denied     = new Set(rule.denied ?? []);

  // New action — not in express, implied, OR denied
  if (!allGranted.has(action) && !denied.has(action) && outcome === "allowed") {
    addExpansionEvent(agentRole, action, "new_action", "HIGH",
      `Agent "${agentRole}" used action "${action}" which is not in its scope definition`);
  }

  // Denial bypass — action was in denied list but still executed
  if (denied.has(action) && outcome === "allowed") {
    addExpansionEvent(agentRole, action, "denial_bypass", "CRITICAL",
      `Agent "${agentRole}" executed explicitly DENIED action "${action}"`);
  }
}

function addExpansionEvent(
  agentRole: string, action: string,
  type:      ScopeExpansionEvent["type"],
  severity:  ScopeExpansionEvent["severity"],
  details:   string
): void {
  if (expansionEvents.length >= MAX_EXPANSION_EVENTS) expansionEvents.shift();
  expansionEvents.push({
    eventId:    `exp-${randomUUID().slice(0, 8)}`,
    agentRole, action, type, severity, details,
    detectedAt: new Date().toISOString(),
  });
}

// ── Report generator ──────────────────────────────────────────────────────────

/**
 * Generate a scope creep report for one agent role.
 * Compares the agent's defined scope against what it actually used.
 */
export function generateCreepReport(agentRole: string): CreepReport | null {
  const rule = MEDICAL_SCOPE_RULES.find((r) => r.role === agentRole);
  if (!rule) return null;

  const granted  = rule.express ?? [];
  const implied  = rule.implied ?? [];
  const denied   = rule.denied  ?? [];

  // Aggregate all used actions across sessions
  const usedActions = new Set<string>();
  let sessions      = 0;
  let earliestAt    = "";
  let latestAt      = "";

  for (const [, session] of sessionIndex.entries()) {
    if (session.agentRole !== agentRole) continue;
    for (const a of session.usedActions) usedActions.add(a);
    sessions++;
    if (!earliestAt || session.startedAt < earliestAt) earliestAt = session.startedAt;
    if (!latestAt   || session.lastSeenAt > latestAt)   latestAt   = session.lastSeenAt;
  }

  const allGrantedSet = new Set([...granted, ...implied]);
  const usedSet       = usedActions;

  const unusedGranted   = granted.filter((a) => !usedSet.has(a));
  const usedButImplied  = implied.filter((a) =>  usedSet.has(a));
  const newActions      = [...usedSet].filter((a) => !allGrantedSet.has(a) && !denied.includes(a));

  // Creep score: ratio of unused granted permissions to total granted
  const creepScore = granted.length > 0
    ? Math.min(1, unusedGranted.length / granted.length + newActions.length * 0.2)
    : 0;

  const recommendation = buildRecommendation(agentRole, unusedGranted, newActions, usedButImplied, creepScore);

  return {
    agentRole,
    granted,
    implied,
    denied,
    usedActions: [...usedSet],
    unusedGranted,
    usedButImplied,
    newActions,
    creepScore: Math.round(creepScore * 100) / 100,
    recommendation,
    sessions,
    observationPeriod: earliestAt && latestAt ? `${earliestAt} → ${latestAt}` : "no sessions observed",
  };
}

function buildRecommendation(
  agentRole:     string,
  unusedGranted: string[],
  newActions:    string[],
  _usedImplied:  string[],
  creepScore:    number
): string {
  const parts: string[] = [];

  if (newActions.length > 0) {
    parts.push(`CRITICAL: Agent "${agentRole}" used ${newActions.length} undeclared action(s): [${newActions.join(", ")}] — add to scope definition or block immediately.`);
  }

  if (unusedGranted.length > 0 && creepScore > 0.3) {
    parts.push(`Remove ${unusedGranted.length} unused permission(s) never observed in production: [${unusedGranted.join(", ")}].`);
  }

  if (creepScore < 0.1) {
    parts.push(`Scope is clean — agent is using ${Math.round((1 - creepScore) * 100)}% of granted permissions.`);
  } else if (creepScore < 0.4) {
    parts.push(`Minor over-provisioning (score: ${creepScore.toFixed(2)}). Review unused grants.`);
  } else {
    parts.push(`Significant scope creep risk (score: ${creepScore.toFixed(2)}). Apply least-privilege: start fresh and add only what's observed.`);
  }

  return parts.join(" | ");
}

/** Generate creep reports for ALL agent roles. */
export function generateAllCreepReports(): CreepReport[] {
  return MEDICAL_SCOPE_RULES
    .map((r) => generateCreepReport(r.role))
    .filter((r): r is CreepReport => r !== null);
}

/** Get all scope expansion events, newest first. */
export function getExpansionEvents(limit = 50): ScopeExpansionEvent[] {
  return [...expansionEvents].reverse().slice(0, limit);
}

/** Get expansion events filtered by severity. */
export function getCriticalExpansions(): ScopeExpansionEvent[] {
  return expansionEvents.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH");
}

/** Get usage records for a specific session or agent role. */
export function getUsageRecords(opts: {
  sessionId?:string;
  agentRole?: string;
  limit?:     number;
}): UsageRecord[] {
  let records = [...usageLog].reverse();
  if (opts.sessionId) records = records.filter((r) => r.sessionId === opts.sessionId);
  if (opts.agentRole) records = records.filter((r) => r.agentRole === opts.agentRole);
  return records.slice(0, opts.limit ?? 100);
}

/** Clear observation data (for testing or session reset). */
export function resetObservations(): void {
  usageLog.length = 0;
  sessionIndex.clear();
  expansionEvents.length = 0;
}
