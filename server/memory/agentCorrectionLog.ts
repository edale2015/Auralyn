/**
 * agentCorrectionLog.ts — Physician-corrected decisions → prose rules
 *
 * Article insight (§11 — "Ask Claude To Keep A Correction Log"):
 *   "We can add instructions in CLAUDE.md to keep a log of corrections in
 *   docs/claude-corrections.md. Agents read this corrections file at session
 *   start. Format: [Short description] | Mistake | Correction | Rule."
 *
 * Existing system vs. this module:
 *   physicianLearningEngine.ts — adjusts numeric confidence weights from corrections
 *   caseOutcomeRecorder.ts — records outcome data for RLHF
 *   THIS MODULE — extracts explicit prose rules from corrections that agents load
 *   as pre-prompt preamble at session start (deterministic rule injection, not
 *   probabilistic weight shifting).
 *
 * Physician corrects an agent → correction is logged as a structured rule →
 * next time that agent type starts a session, buildSessionPreamble() returns a
 * preamble of "never do X, always do Y" rules based on past corrections.
 */

import { getRedisAsync } from "../queue/redis";

// ── Types ────────────────────────────────────────────────────────────────────

export type CorrectionSeverity = "low" | "medium" | "high" | "critical";

export interface CorrectionEntry {
  id:            string;
  timestamp:     number;
  sessionId:     string;
  agentRole:     string;      // which agent made the mistake
  caseId?:       string;
  patientId?:    string;
  mistake:       string;      // what the agent did wrong
  correction:    string;      // what the correct action was
  rule:          string;      // the general rule extracted for future sessions
  severity:      CorrectionSeverity;
  confirmedBy:   string;      // physician ID who issued the correction
  appliesTo:     string[];    // ["triage_agent"] or ["*"] for all agents
  category:      string;      // "diagnosis" | "medication" | "escalation" | "documentation" | "billing"
}

// ── In-memory store + Redis persistence ──────────────────────────────────────

const _corrections: CorrectionEntry[] = [];
const REDIS_KEY = "agent:correction_log";

async function persistToRedis(entry: CorrectionEntry): Promise<void> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return;
    if (typeof redis.lpush === "function") {
      await redis.lpush(REDIS_KEY, JSON.stringify(entry));
    } else if (typeof redis.set === "function") {
      await redis.set(`${REDIS_KEY}:${entry.id}`, JSON.stringify(entry));
    }
  } catch { /* Redis optional — in-memory is source of truth */ }
}

// ── Log a correction ──────────────────────────────────────────────────────────

export async function logCorrection(
  entry: Omit<CorrectionEntry, "id" | "timestamp">
): Promise<CorrectionEntry> {
  const full: CorrectionEntry = {
    ...entry,
    id:        `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  _corrections.push(full);
  await persistToRedis(full);
  return full;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getAllCorrections(): CorrectionEntry[] {
  return [..._corrections].sort((a, b) => b.timestamp - a.timestamp);
}

export function getCorrectionsByAgent(agentRole: string): CorrectionEntry[] {
  return _corrections.filter(
    (c) => c.agentRole === agentRole || c.appliesTo.includes("*") || c.appliesTo.includes(agentRole)
  );
}

export function getCorrectionsByCategory(category: string): CorrectionEntry[] {
  return _corrections.filter((c) => c.category === category);
}

export function getCorrectionsBySeverity(severity: CorrectionSeverity): CorrectionEntry[] {
  return _corrections.filter((c) => c.severity === severity);
}

export function getCriticalCorrections(): CorrectionEntry[] {
  return _corrections.filter((c) => c.severity === "critical" || c.severity === "high");
}

// ── Session preamble builder ──────────────────────────────────────────────────

/**
 * Builds a plain-text preamble of "never do X, always do Y" rules
 * that gets injected at the top of an agent's system prompt at session start.
 *
 * Article: "Always read docs/claude-corrections.md at the start of each session
 * before doing any work."
 */
export function buildSessionPreamble(agentRole: string): string {
  const applicable = getCorrectionsByAgent(agentRole);
  if (applicable.length === 0) return "";

  // Prioritise: critical first, then high, then by recency
  const SEVERITY_ORDER: Record<CorrectionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...applicable].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return sev !== 0 ? sev : b.timestamp - a.timestamp;
  });

  // Maximum 20 rules to avoid context bloat (article: "Target under 200 lines")
  const MAX_RULES = 20;
  const selected = sorted.slice(0, MAX_RULES);

  const lines: string[] = [
    `## Correction Rules for ${agentRole} (loaded at session start)`,
    `Based on ${applicable.length} physician correction(s). Apply these rules before every action.`,
    "",
  ];

  for (const entry of selected) {
    const date     = new Date(entry.timestamp).toISOString().slice(0, 10);
    const severity = entry.severity.toUpperCase();
    lines.push(`### [${severity}] ${entry.category} — ${date}`);
    lines.push(`- **Mistake:** ${entry.mistake}`);
    lines.push(`- **Correction:** ${entry.correction}`);
    lines.push(`- **Rule:** ${entry.rule}`);
    if (entry.caseId) lines.push(`  *(case: ${entry.caseId})*`);
    lines.push("");
  }

  if (applicable.length > MAX_RULES) {
    lines.push(`*(${applicable.length - MAX_RULES} older corrections truncated — review full log via /api/scope/corrections)*`);
  }

  return lines.join("\n");
}

// ── Preamble summary (shorter version for cost-sensitive agents) ───────────────

export function buildConcisePreamble(agentRole: string): string {
  const applicable = getCorrectionsByAgent(agentRole);
  if (applicable.length === 0) return "";

  const critical  = applicable.filter((c) => c.severity === "critical" || c.severity === "high");
  const selected  = critical.slice(0, 5);

  if (selected.length === 0) return "";

  const rules = selected.map((c) => `- RULE: ${c.rule}`).join("\n");
  return `## Critical Rules (${agentRole})\n${rules}\n`;
}

// ── Bulk load from Redis on startup ──────────────────────────────────────────

export async function loadCorrectionsFromRedis(): Promise<number> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return 0;

    // Try lrange for list storage
    if (typeof redis.lrange === "function") {
      const raw: string[] = await redis.lrange(REDIS_KEY, 0, 999);
      let loaded = 0;
      for (const r of raw) {
        try {
          const entry = JSON.parse(r) as CorrectionEntry;
          if (!_corrections.find((c) => c.id === entry.id)) {
            _corrections.push(entry);
            loaded++;
          }
        } catch { /* skip malformed */ }
      }
      return loaded;
    }
    return 0;
  } catch { return 0; }
}

// ── Correction statistics ─────────────────────────────────────────────────────

export function getCorrectionStats(): {
  total:       number;
  byAgent:     Record<string, number>;
  byCategory:  Record<string, number>;
  bySeverity:  Record<string, number>;
  recentCount: number;    // last 24h
} {
  const byAgent:    Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const yesterday   = Date.now() - 24 * 60 * 60 * 1000;
  let   recentCount = 0;

  for (const c of _corrections) {
    byAgent[c.agentRole]     = (byAgent[c.agentRole] ?? 0) + 1;
    byCategory[c.category]   = (byCategory[c.category] ?? 0) + 1;
    bySeverity[c.severity]   = (bySeverity[c.severity] ?? 0) + 1;
    if (c.timestamp >= yesterday) recentCount++;
  }

  return { total: _corrections.length, byAgent, byCategory, bySeverity, recentCount };
}
