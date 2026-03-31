/**
 * Co-morbidity Engine
 *
 * Applies pairwise interaction adjustments over base Bayesian scores.
 * Reads from kb_diagnosis_interactions (synergy | exclusion | conditional | risk_boost).
 * All adjustments are in log-space so they compose cleanly with the Bayesian scorer.
 *
 * Source: KB_DB only. No hardcoded interactions.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DxScore {
  ruleId?: string;
  diagnosis: string;       // diagnosisLabel
  diagnosisId?: string;
  complaintId?: string;
  score: number;           // log-likelihood score
  posterior?: number;
  baseProbability?: number;
  source?: string;
  meta?: Record<string, unknown>;
  features?: unknown[];
  interactions?: InteractionHit[];
}

export interface InteractionHit {
  interactionId: number;
  type: string;
  dxA: string;
  dxB: string;
  strength: number;
  adjustment: number;
}

interface InteractionRow {
  id: number;
  dx_a: string;
  dx_b: string;
  interaction_type: string;
  strength: number;
  conditions: Record<string, unknown> | null;
  notes: string | null;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _interactionCache: InteractionRow[] | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadInteractions(): Promise<InteractionRow[]> {
  if (_interactionCache && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    return _interactionCache;
  }
  const rows = extractRows(await db.execute(sql`
    SELECT id, dx_a, dx_b, interaction_type, strength, conditions, notes
    FROM kb_diagnosis_interactions
    WHERE is_active = true
    ORDER BY id
  `));
  _interactionCache = rows.map(r => ({
    id: r.id,
    dx_a: r.dx_a,
    dx_b: r.dx_b,
    interaction_type: r.interaction_type,
    strength: Number(r.strength),
    conditions: r.conditions ?? null,
    notes: r.notes ?? null,
  }));
  _cacheLoadedAt = Date.now();
  return _interactionCache;
}

export function invalidateCoMorbidityCache(): void {
  _interactionCache = null;
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function meetsConditions(input: Record<string, unknown>, cond: Record<string, unknown> | null): boolean {
  if (!cond) return true;
  for (const [k, v] of Object.entries(cond)) {
    if (typeof v === "object" && v !== null) {
      const vObj = v as Record<string, unknown>;
      if (">" in vObj && !(Number(input[k]) > Number(vObj[">"]))) return false;
      if ("<" in vObj && !(Number(input[k]) < Number(vObj["<"]))) return false;
      if (">=" in vObj && !(Number(input[k]) >= Number(vObj[">="]))) return false;
      if ("<=" in vObj && !(Number(input[k]) <= Number(vObj["<="]))) return false;
    } else {
      if (input[k] !== v) return false;
    }
  }
  return true;
}

// ── Main: apply pairwise co-morbidity adjustments ────────────────────────────

export async function applyCoMorbidityAdjustments(
  input: Record<string, unknown>,
  baseResults: DxScore[],
): Promise<DxScore[]> {
  const interactions = await loadInteractions();
  if (interactions.length === 0) return baseResults;

  // Build label→score map (deep copy)
  const map = new Map<string, DxScore>(
    baseResults.map(r => [r.diagnosis.toLowerCase(), { ...r, interactions: [] }])
  );

  for (const inter of interactions) {
    if (!meetsConditions(input, inter.conditions)) continue;

    const keyA = inter.dx_a.toLowerCase();
    const keyB = inter.dx_b.toLowerCase();
    const a = map.get(keyA);
    const b = map.get(keyB);
    if (!a || !b) continue;

    const adj = inter.strength;
    let adjA = 0;
    let adjB = 0;

    switch (inter.interaction_type) {
      case "synergy":
        adjA = adj;
        adjB = adj;
        break;
      case "risk_boost":
        if (a.score > -5 && b.score > -5) { adjA = adj; adjB = adj; }
        break;
      case "exclusion":
        if (a.score > b.score) adjB = adj; // adj is negative
        else adjA = adj;
        break;
      case "conditional":
        adjA = adj;
        adjB = adj;
        break;
    }

    a.score += adjA;
    b.score += adjB;

    const hit: InteractionHit = {
      interactionId: inter.id,
      type: inter.interaction_type,
      dxA: inter.dx_a,
      dxB: inter.dx_b,
      strength: inter.strength,
      adjustment: Math.abs(adjA) + Math.abs(adjB),
    };
    a.interactions = [...(a.interactions ?? []), hit];
    b.interactions = [...(b.interactions ?? []), hit];
  }

  const results = Array.from(map.values()).sort((x, y) => y.score - x.score);

  // Re-normalize posteriors after adjustments (softmax)
  const maxScore = Math.max(...results.map(r => r.score));
  const expScores = results.map(r => Math.exp(r.score - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  results.forEach((r, i) => { r.posterior = expScores[i] / sumExp; });

  return results;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getCoMorbidityStats() {
  return {
    cachedInteractions: _interactionCache?.length ?? 0,
    cacheAge: _interactionCache ? Math.round((Date.now() - _cacheLoadedAt) / 1000) + "s" : null,
  };
}
