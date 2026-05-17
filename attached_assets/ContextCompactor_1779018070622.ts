/**
 * ContextCompactor — safe reduction of working context.
 *
 * The hard part of compaction (as the article notes) is deciding what
 * survives. For a clinical encounter, the answer is sharper than for a
 * general-purpose agent:
 *
 *   NEVER COMPACT:
 *     - Immutables (chief complaint, allergies, vitals, red flags, constraints)
 *     - Any artifact (they're already distilled — that's their purpose)
 *     - The most recent N turns of working context (last_5 by default)
 *
 *   COMPACT BY SUMMARIZATION:
 *     - Older answered questions: keep the finding extracted, drop the
 *       verbatim Q/A text
 *     - Refuted differential entries below likelihood 0.05 for 3+ steps
 *     - Pending questions that have been pending > 5 steps (likely stale)
 *
 *   ALWAYS PROMOTE TO ARTIFACT BEFORE COMPACTING:
 *     - Any differential entry that gets dropped → ruled_out artifact
 *     - Any "almost answered" question → uncertainty artifact
 *
 * The compactor emits a `compaction_summary` artifact recording what it
 * summarized, so audit can reconstruct what was condensed.
 */

import {
  Artifact,
  ArtifactType,
  ClinicalImmutables,
  EncounterContext,
  WorkingContext,
} from "./types";
import { estimateTokens } from "./ClinicalContextManager";

export interface CompactionPolicy {
  /** Trigger compaction when working tier estimated tokens exceeds this. */
  workingTokenThreshold: number;
  /** Always keep the last N answered questions verbatim. */
  keepRecentAnsweredQuestions: number;
  /** Drop differential items with likelihood below this AND no recent update. */
  dropDifferentialBelow: number;
  /** A differential item is "stale" if not updated in this many steps. */
  staleDifferentialSteps: number;
  /** Cancel pending questions older than this many steps. */
  pendingQuestionStaleSteps: number;
}

export const DEFAULT_POLICY: CompactionPolicy = {
  workingTokenThreshold: 4_000,
  keepRecentAnsweredQuestions: 5,
  dropDifferentialBelow: 0.05,
  staleDifferentialSteps: 3,
  pendingQuestionStaleSteps: 5,
};

export interface CompactionResult {
  compacted: boolean;
  beforeTokens: number;
  afterTokens: number;
  newArtifacts: Artifact[];
  newWorking: WorkingContext;
}

export class ContextCompactor {
  constructor(private readonly policy: CompactionPolicy = DEFAULT_POLICY) {}

  shouldCompact(ctx: EncounterContext): boolean {
    return ctx.working.estimatedTokens >= this.policy.workingTokenThreshold;
  }

  /**
   * Compact the working context. Returns the new working context plus any
   * new artifacts the compactor needed to emit to preserve information that
   * was being dropped.
   *
   * IMPORTANT: This function is pure with respect to immutables. It NEVER
   * modifies the immutables tier.
   */
  compact(ctx: EncounterContext): CompactionResult {
    if (!this.shouldCompact(ctx)) {
      return {
        compacted: false,
        beforeTokens: ctx.working.estimatedTokens,
        afterTokens: ctx.working.estimatedTokens,
        newArtifacts: [],
        newWorking: ctx.working,
      };
    }

    const beforeTokens = ctx.working.estimatedTokens;
    const newArtifacts: Artifact[] = [];
    const currentStep = ctx.working.step;
    const nowIso = new Date().toISOString();

    // 1. Promote stale, low-likelihood differential items to ruled_out
    //    artifacts, then drop them from working context.
    const keptDifferential = [] as typeof ctx.working.currentDifferential;
    for (const d of ctx.working.currentDifferential) {
      const isStale = currentStep - d.lastUpdatedStep >= this.policy.staleDifferentialSteps;
      const isLowLikelihood = d.likelihood < this.policy.dropDifferentialBelow;
      if (isStale && isLowLikelihood) {
        const payload = {
          diagnosis: d.diagnosis,
          reason: `Dropped after ${currentStep - d.lastUpdatedStep} steps with likelihood ${(
            d.likelihood * 100
          ).toFixed(1)}%`,
          evidence: d.refutingFindings,
          reconsiderIf: [
            "new finding contradicts current evidence",
            "physician explicitly re-raises this possibility",
          ],
        };
        const art: Artifact = {
          id: `art_ruleout_${d.diagnosis.replace(/\s+/g, "_")}_${currentStep}`,
          type: "ruled_out",
          producedBy: "differential",
          producedAt: nowIso,
          consumedBy: [],
          payload,
          provenance: { source: "rule_engine", citation: "compactor:auto" },
          estimatedTokens: estimateTokens(JSON.stringify(payload)) + 30,
        };
        newArtifacts.push(art);
      } else {
        keptDifferential.push(d);
      }
    }

    // 2. Cancel stale pending questions; emit uncertainty artifacts so
    //    downstream agents know what we never resolved.
    const keptPending = [] as typeof ctx.working.pendingQuestions;
    for (const q of ctx.working.pendingQuestions) {
      const age = currentStep - q.createdAtStep;
      if (age >= this.policy.pendingQuestionStaleSteps) {
        const payload = {
          question: q.text,
          whyItMatters: q.purpose,
          blockedAgents: [] as Array<"triage" | "differential" | "disposition" | "billing" | "supervisor">,
        };
        newArtifacts.push({
          id: `art_uncertainty_${q.id}`,
          type: "uncertainty",
          producedBy: "differential",
          producedAt: nowIso,
          consumedBy: [],
          payload,
          provenance: { source: "rule_engine", citation: "compactor:stale_question" },
          estimatedTokens: estimateTokens(JSON.stringify(payload)) + 20,
        });
      } else {
        keptPending.push(q);
      }
    }

    // 3. Trim answered questions: keep the most recent N verbatim, summarize
    //    the rest into a compaction_summary artifact.
    const allAnswered = ctx.working.answeredQuestions;
    const cutoff = Math.max(0, allAnswered.length - this.policy.keepRecentAnsweredQuestions);
    const summarized = allAnswered.slice(0, cutoff);
    const keptAnswered = allAnswered.slice(cutoff);

    if (summarized.length > 0) {
      const highlights = summarized.map((q) => {
        const findings = q.extractedFindings?.length
          ? ` → ${q.extractedFindings.join("; ")}`
          : "";
        return `[${q.answeredAt}] ${q.question.slice(0, 60)} → ${q.answer.slice(0, 80)}${findings}`;
      });
      const payload = {
        summarizedSteps: [0, currentStep] as [number, number],
        highlights,
        preservedArtifactIds: ctx.artifacts.map((a) => a.id),
      };
      newArtifacts.push({
        id: `art_compact_${currentStep}`,
        type: "compaction_summary",
        producedBy: "differential",
        producedAt: nowIso,
        consumedBy: [],
        payload,
        provenance: { source: "rule_engine", citation: "compactor:autosummary" },
        estimatedTokens: estimateTokens(JSON.stringify(payload)) + 50,
      });
    }

    // 4. Build new working tier and recompute token estimate.
    const newWorking: WorkingContext = {
      ...ctx.working,
      currentDifferential: keptDifferential,
      pendingQuestions: keptPending,
      answeredQuestions: keptAnswered,
      estimatedTokens: 0,
    };
    newWorking.estimatedTokens = estimateTokens(JSON.stringify(newWorking));

    return {
      compacted: true,
      beforeTokens,
      afterTokens: newWorking.estimatedTokens,
      newArtifacts,
      newWorking,
    };
  }
}

// ─── A note about clinical safety ──────────────────────────────────────────
//
// Compaction in a clinical setting carries safety implications general
// agents don't face. Specifically:
//
//   - Once a finding is promoted to a red flag in immutables, the compactor
//     has no power to remove it. That's by design.
//
//   - A differential item is only dropped when it is BOTH stale AND low
//     likelihood. A high-likelihood-but-not-recently-updated entry stays.
//
//   - Pending questions that get cancelled become `uncertainty` artifacts
//     visible to the supervisor — so a human is in the loop if something
//     was never resolved.
//
//   - The compactor itself is purely deterministic. There is NO model call
//     to "summarize." Model-generated compaction summaries can hallucinate
//     and quietly drop critical findings. For Auralyn, all compaction is
//     structural and rule-driven.
