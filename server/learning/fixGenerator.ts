/**
 * Packet 14 — Learning Loop: fix generator
 *
 * Converts learning signals into constrained ProposedFix objects.
 * All generated fixes are category "clinical" and autoApprove: false.
 * No fix is ever applied without explicit physician review and governance
 * gate approval (enforced by the learningOrchestrator and selfImprove.ts).
 *
 * Fix types are intentionally constrained — the generator is NOT a free-form
 * LLM rewriter. It produces structured change proposals only.
 */

import { randomUUID } from "crypto";
import type { LearningSignal } from "./learningSignals";
import type { ProposedFix } from "./fixTypes";

export function generateFixes(signals: LearningSignal[]): ProposedFix[] {
  const fixes: ProposedFix[] = [];

  for (const s of signals) {
    switch (s.failureType) {

      // ── Missed diagnosis → propose prior increase ──────────────────────
      case "missed_diagnosis": {
        if (!s.expected) break;
        fixes.push({
          id: randomUUID(),
          type: "adjust_prior",
          target: {
            complaint: s.context.complaint,
            diagnosis: String(s.expected),
          },
          change: {
            from: s.context.posterior?.differential?.find(
              (d: any) => d.diagnosis === s.expected,
            )?.posterior ?? null,
            to: "increase",
          },
          reason: `Missed expected diagnosis "${s.expected}" for complaint "${s.context.complaint}"`,
          sourceSignalId: s.caseId,
          category: "clinical",
          autoApprove: false,
        });
        break;
      }

      // ── Wrong disposition → propose threshold or prior review ──────────
      case "wrong_disposition": {
        fixes.push({
          id: randomUUID(),
          type: "adjust_prior",
          target: {
            complaint: s.context.complaint,
            parameter: "disposition_threshold",
          },
          change: {
            from: s.actual,
            to: s.expected,
          },
          reason: `Wrong disposition for "${s.context.complaint}": expected "${s.expected}", got "${s.actual}"`,
          sourceSignalId: s.caseId,
          category: "clinical",
          autoApprove: false,
        });
        break;
      }

      // ── Over-escalation → propose risk threshold increase ──────────────
      case "over_escalation": {
        fixes.push({
          id: randomUUID(),
          type: "adjust_threshold",
          target: {
            complaint: s.context.complaint,
            parameter: "riskThreshold",
          },
          change: {
            to: "increase",
          },
          reason: `Over-escalation detected for complaint "${s.context.complaint}"`,
          sourceSignalId: s.caseId,
          category: "clinical",
          autoApprove: false,
        });
        break;
      }

      // ── Unsafe pass → propose red flag addition ────────────────────────
      case "unsafe_pass": {
        fixes.push({
          id: randomUUID(),
          type: "add_red_flag",
          target: {
            complaint: s.context.complaint,
          },
          change: {
            to: {
              symptoms: s.context.symptoms,
              disposition: "BLOCKED",
            },
          },
          reason: `Safety gate failed to block unsafe case for "${s.context.complaint}"`,
          sourceSignalId: s.caseId,
          category: "clinical",
          autoApprove: false,
        });
        break;
      }

      // ── Uncertainty misclassification → propose feature likelihood add ─
      case "uncertainty_misclassification": {
        fixes.push({
          id: randomUUID(),
          type: "add_feature_likelihood",
          target: {
            complaint: s.context.complaint,
            parameter: "uncertainty_margin",
          },
          change: {
            to: "tighten_margin",
          },
          reason: `Uncertainty misclassification for "${s.context.complaint}": expected "${s.expected}", got "${s.actual}"`,
          sourceSignalId: s.caseId,
          category: "clinical",
          autoApprove: false,
        });
        break;
      }

      default:
        break;
    }
  }

  return fixes;
}
