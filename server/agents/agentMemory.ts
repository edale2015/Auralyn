/**
 * agentMemory.ts — Persistent agent memory across runs
 *
 * Article: "Agent memory across runs — Persistent Agent Memory (learning across runs)"
 * Article (Cursor Automations): "keeps a memory of past runs to improve over time"
 *
 * Clinical application:
 *   An agent that assessed 50 sepsis patients in the ED over one shift builds up:
 *     - Which presentations were confirmed sepsis (positive outcomes)
 *     - Which triage decisions were overridden by physicians (corrections)
 *     - Drug interactions flagged by pharmacology (preferences)
 *     - High-acuity patterns that preceded deterioration (clinical lessons)
 *
 *   This memory is injected into subsequent queries as few-shot context,
 *   making the agent progressively better at this specific clinical environment.
 *
 *   This is NOT retraining the model — it's structured in-context learning via
 *   a managed memory store. Safe, auditable, reversible.
 *
 * Memory types:
 *   clinical_decision  — diagnosis/treatment decision made by agent
 *   outcome            — what actually happened (feedback loop)
 *   physician_override — when physician corrected the agent
 *   drug_interaction   — flagged interaction pattern
 *   pattern_learned    — recurring clinical pattern detected
 *   preference         — operational preference for this deployment
 *
 * Memory retrieval:
 *   `getMemoryContext(agentId, query)` returns the top-K most relevant memories
 *   formatted as a context block for injection into the next prompt.
 */

import { db } from "../db";
import { agentMemoryLog, type InsertAgentMemory } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryType =
  | "clinical_decision"
  | "outcome"
  | "physician_override"
  | "drug_interaction"
  | "pattern_learned"
  | "preference";

export interface MemoryEntry {
  agentId:     string;
  memoryType:  MemoryType;
  content:     string;
  importance:  number;   // 0–1: higher = retrieved first
  context?:    Record<string, unknown>;
}

// ── Save memory ───────────────────────────────────────────────────────────────

export async function saveMemory(entry: MemoryEntry): Promise<{ id: number }> {
  const toInsert: InsertAgentMemory = {
    agentId:    entry.agentId,
    memoryType: entry.memoryType,
    content:    entry.content,
    importance: Math.min(1, Math.max(0, entry.importance)),
    context:    entry.context ?? null,
  };

  const [row] = await db.insert(agentMemoryLog).values(toInsert).returning({ id: agentMemoryLog.id });
  return { id: row.id };
}

// ── Get memories ──────────────────────────────────────────────────────────────

export async function getMemory(
  agentId: string,
  options: {
    limit?:      number;
    memoryType?: MemoryType;
    minImportance?: number;
  } = {},
) {
  const limit        = Math.min(options.limit ?? 20, 100);
  const conditions   = [eq(agentMemoryLog.agentId, agentId)];

  if (options.memoryType)    conditions.push(eq(agentMemoryLog.memoryType, options.memoryType));
  if (options.minImportance) conditions.push(sql`${agentMemoryLog.importance} >= ${options.minImportance}`);

  return db.select().from(agentMemoryLog)
    .where(and(...conditions))
    .orderBy(desc(agentMemoryLog.importance), desc(agentMemoryLog.createdAt))
    .limit(limit);
}

// ── Get memory context block (for prompt injection) ───────────────────────────

export async function getMemoryContext(
  agentId:   string,
  topK = 5,
): Promise<string> {
  const memories = await getMemory(agentId, { limit: topK, minImportance: 0.3 });

  if (memories.length === 0) return "";

  const lines = memories.map((m) =>
    `[${m.memoryType.toUpperCase()}] (importance=${m.importance?.toFixed(2)}) ${m.content}`
  );

  return `\n--- Agent Memory (${memories.length} relevant entries) ---\n${lines.join("\n")}\n---\n`;
}

// ── Record physician override (RLHF signal) ───────────────────────────────────

export async function recordPhysicianOverride(
  agentId:          string,
  originalDecision: string,
  physicianAction:  string,
  context?:         Record<string, unknown>,
): Promise<void> {
  await saveMemory({
    agentId,
    memoryType:  "physician_override",
    content:     `Agent: "${originalDecision}" → Physician override: "${physicianAction}"`,
    importance:  0.9,  // High importance — physician corrections are valuable signal
    context,
  });
}

// ── Record outcome (RLHF reward signal) ──────────────────────────────────────

export async function recordOutcome(
  agentId:   string,
  caseId:    string,
  outcome:   "correct" | "incorrect" | "partial",
  details:   string,
  context?:  Record<string, unknown>,
): Promise<void> {
  const importanceMap = { correct: 0.6, incorrect: 0.95, partial: 0.7 };
  await saveMemory({
    agentId,
    memoryType: "outcome",
    content:    `Case ${caseId}: ${outcome.toUpperCase()} — ${details}`,
    importance: importanceMap[outcome],
    context,
  });
}

// ── Summarize memory (compact for long-running agents) ────────────────────────

export async function summarizeMemory(agentId: string): Promise<{
  totalEntries:    number;
  byType:          Record<string, number>;
  avgImportance:   number;
  topPattern:      string | null;
}> {
  const all = await getMemory(agentId, { limit: 100 });

  const byType: Record<string, number> = {};
  let totalImportance = 0;

  for (const m of all) {
    byType[m.memoryType] = (byType[m.memoryType] ?? 0) + 1;
    totalImportance += m.importance ?? 0;
  }

  const patterns = all.filter((m) => m.memoryType === "pattern_learned");

  return {
    totalEntries:   all.length,
    byType,
    avgImportance:  all.length > 0 ? Math.round((totalImportance / all.length) * 100) / 100 : 0,
    topPattern:     patterns[0]?.content ?? null,
  };
}

// ── Prune old low-importance memories (prevent context bloat) ─────────────────

export async function pruneMemory(agentId: string, keepTop = 50): Promise<{ pruned: number }> {
  // Get all memories sorted by importance desc
  const all = await getMemory(agentId, { limit: 500 });
  if (all.length <= keepTop) return { pruned: 0 };

  const toDelete = all.slice(keepTop).map((m) => m.id);
  if (toDelete.length === 0) return { pruned: 0 };

  // Delete by IDs
  for (const id of toDelete) {
    await db.delete(agentMemoryLog).where(
      and(eq(agentMemoryLog.agentId, agentId), eq(agentMemoryLog.id, id))
    );
  }
  return { pruned: toDelete.length };
}
