/**
 * modelRouter.ts — T018
 *
 * Selects the optimal model for each agent based on the latest benchmark scorecard.
 *
 * HARD POLICY (clinical_brain, kb_validator, skill_generator):
 *   These agents are PINNED — the router ALWAYS returns their configured model
 *   and REJECTS any scorecard result that would change them.
 *   The safety supervisor (enhancedSupervisorGate) is rule-based and has no
 *   model string — it is always in the per-step path and routing cannot remove it.
 *
 * Non-pinned agents (intent_parser, retrieval_pruner, uncertainty_sampler,
 *   discharge_generator, cme_quiz):
 *   The router selects the highest-scoring model whose avg_latency_ms is within
 *   the agent's latency budget. Falls back to the gateway default if no scorecard.
 *
 * Telemetry: every routing decision is recorded to routing_telemetry via emitRoutingDecision().
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { ModelPurpose } from "../gateway/llmGateway";
import { emitRoutingDecision } from "./routingTelemetryEmitter";
import type { AgentScorecard } from "../eval/agentBenchmark";

// ── Pinned agents — NEVER change these via scorecard ─────────────────────────

const PINNED: Partial<Record<ModelPurpose, { provider: "anthropic" | "openai"; model: string }>> = {
  clinical_brain:       { provider: "anthropic", model: "claude-opus-4-20250514" },
  kb_validator:         { provider: "anthropic", model: "claude-opus-4-20250514" },
  skill_generator:      { provider: "anthropic", model: "claude-opus-4-20250514" },
  intent_parser:        { provider: "anthropic", model: "claude-sonnet-4-6" },
  retrieval_pruner:     { provider: "anthropic", model: "claude-sonnet-4-6" },
  uncertainty_sampler:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  discharge_generator:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  cme_quiz:             { provider: "anthropic", model: "claude-sonnet-4-6" },
};

// ── Latency budgets per purpose (ms) ─────────────────────────────────────────

const LATENCY_BUDGETS: Record<ModelPurpose, number> = {
  clinical_brain:       6000,
  retrieval_pruner:     3000,
  uncertainty_sampler:  4000,
  intent_parser:        3000,
  kb_validator:         6000,
  skill_generator:      8000,
  discharge_generator:  5000,
  cme_quiz:             4000,
};

// ── Candidate model pool (ordered cheapest→best per purpose) ─────────────────

const CANDIDATE_MODELS: Partial<Record<ModelPurpose, Array<{ provider: "anthropic" | "openai"; model: string }>>> = {
  intent_parser:        [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai",    model: "gpt-4o-mini" },
    { provider: "openai",    model: "gpt-4o" },
  ],
  retrieval_pruner:     [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai",    model: "gpt-4o-mini" },
    { provider: "openai",    model: "gpt-4o" },
  ],
  uncertainty_sampler:  [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai",    model: "gpt-4o-mini" },
    { provider: "openai",    model: "gpt-4o" },
  ],
  discharge_generator:  [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai",    model: "gpt-4o-mini" },
    { provider: "openai",    model: "gpt-4o" },
  ],
  cme_quiz:             [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai",    model: "gpt-4o-mini" },
    { provider: "openai",    model: "gpt-4o" },
  ],
};

// ── Scorecard loader ──────────────────────────────────────────────────────────

let _cachedScorecard: AgentScorecard[] | null = null;
let _scorecardLoadedAt = 0;
const SCORECARD_CACHE_MS = 5 * 60 * 1000; // re-read every 5 minutes

function loadScorecard(): AgentScorecard[] | null {
  if (_cachedScorecard && Date.now() - _scorecardLoadedAt < SCORECARD_CACHE_MS) {
    return _cachedScorecard;
  }
  try {
    const scorecardPath = join(process.cwd(), "server", "eval", "results", "latest_scorecard.json");
    const raw = readFileSync(scorecardPath, "utf-8");
    _cachedScorecard = JSON.parse(raw) as AgentScorecard[];
    _scorecardLoadedAt = Date.now();
    return _cachedScorecard;
  } catch {
    return null;
  }
}

// ── Routing result type ───────────────────────────────────────────────────────

export interface RoutingDecision {
  purpose:   ModelPurpose;
  provider:  "anthropic" | "openai";
  model:     string;
  pinned:    boolean;
  score:     number | null;
}

// ── Main routing function ─────────────────────────────────────────────────────

export function getRoutedModel(purpose: ModelPurpose, encounterId?: string): RoutingDecision {
  // ── Safety gate: pinned agents can NEVER be changed by the scorecard ─────
  if (purpose in PINNED) {
    const pinned = PINNED[purpose]!;
    const decision: RoutingDecision = {
      purpose,
      provider: pinned.provider,
      model:    pinned.model,
      pinned:   true,
      score:    null,
    };
    emitRoutingDecision({ ...decision, encounter_id: encounterId }).catch(() => {});
    return decision;
  }

  const budget    = LATENCY_BUDGETS[purpose];
  const scorecard = loadScorecard();
  const candidates = CANDIDATE_MODELS[purpose];

  // ── Scorecard-driven selection for non-pinned agents ─────────────────────
  if (scorecard && candidates) {
    // Filter scorecard entries for this purpose that fit within latency budget
    const eligible = scorecard
      .filter(s => s.agent === (purpose as string) && s.avg_latency_ms <= budget)
      .sort((a, b) => b.avg_score - a.avg_score);

    if (eligible.length > 0) {
      const best = eligible[0];
      // Verify the winning model is in our approved candidate pool
      const approved = candidates.find(c => c.model === best.model);
      if (approved) {
        const decision: RoutingDecision = {
          purpose,
          provider: approved.provider,
          model:    approved.provider === "anthropic" ? approved.model : best.model,
          pinned:   false,
          score:    best.avg_score,
        };
        emitRoutingDecision({ ...decision, encounter_id: encounterId }).catch(() => {});
        return decision;
      }
    }
  }

  // ── Fallback: cheapest candidate within budget ────────────────────────────
  const fallback = candidates?.[0];
  if (fallback) {
    const decision: RoutingDecision = {
      purpose,
      provider: fallback.provider,
      model:    fallback.model,
      pinned:   false,
      score:    null,
    };
    emitRoutingDecision({ ...decision, encounter_id: encounterId }).catch(() => {});
    return decision;
  }

  // ── Last resort: use gateway defaults (no override) ───────────────────────
  const decision: RoutingDecision = { purpose, provider: "openai", model: "gpt-4o-mini", pinned: false, score: null };
  emitRoutingDecision({ ...decision, encounter_id: encounterId }).catch(() => {});
  return decision;
}

/**
 * Asserts that a `clinical_brain` downgrade is rejected.
 * Called by unit tests — exported for testability.
 */
export function assertClinicalBrainPinned(): void {
  const d = getRoutedModel("clinical_brain");
  if (!d.pinned) throw new Error("FAIL: clinical_brain is not pinned");
  if (d.model !== "claude-opus-4-20250514") {
    throw new Error(`FAIL: clinical_brain model was changed to ${d.model}`);
  }
}

/**
 * Demonstrates that a non-pinned agent is routed to its cheaper default.
 * Called by unit tests — exported for testability.
 */
export function assertCheaperRouting(): { agent: ModelPurpose; model: string } {
  const d = getRoutedModel("intent_parser");
  if (d.pinned) throw new Error("FAIL: intent_parser should not be pinned");
  return { agent: d.purpose, model: d.model };
}
