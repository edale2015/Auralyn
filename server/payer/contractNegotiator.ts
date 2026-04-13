/**
 * Contract Negotiation Strategy Engine
 * Generates data-driven payer contract negotiation recommendations
 * based on approval rates, revenue performance, and CPT mix.
 */

import type { PayerStats } from "./payerOptimizationEngine";

export type NegotiationAction =
  | "RENEGOTIATE_LOW_APPROVAL"
  | "INCREASE_CPT_MIX"
  | "ESCALATE_RATE_INCREASE"
  | "MAINTAIN_CONTRACT"
  | "AUDIT_DENIAL_PATTERNS";

export interface NegotiationStrategy {
  payer: string;
  action: NegotiationAction;
  rationale: string;
  estimatedRevenueUplift?: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export function generateNegotiationStrategy(payerStats: PayerStats[]): NegotiationStrategy[] {
  return payerStats.map(p => {
    if (p.approvalRate < 0.70) {
      return {
        payer: p.payer,
        action: "RENEGOTIATE_LOW_APPROVAL",
        rationale: `Approval rate of ${(p.approvalRate * 100).toFixed(0)}% is critically low. Renegotiate contract or audit denial patterns.`,
        estimatedRevenueUplift: (p.revenuePotential - p.totalRevenue) * 0.5,
        priority: "HIGH",
      };
    }

    if (p.approvalRate < 0.80) {
      return {
        payer: p.payer,
        action: "AUDIT_DENIAL_PATTERNS",
        rationale: `Approval rate of ${(p.approvalRate * 100).toFixed(0)}% below benchmark 80%. Top denial reasons: ${p.topDenialReasons.join(", ") || "none recorded"}.`,
        estimatedRevenueUplift: (p.revenuePotential - p.totalRevenue) * 0.3,
        priority: "MEDIUM",
      };
    }

    if (p.avgRevenue < 90) {
      return {
        payer: p.payer,
        action: "INCREASE_CPT_MIX",
        rationale: `Average revenue of $${p.avgRevenue.toFixed(0)} is below target. Shift case mix toward 99214/99215 encounters.`,
        estimatedRevenueUplift: p.totalClaims * (110 - p.avgRevenue),
        priority: "MEDIUM",
      };
    }

    if (p.avgRevenue > 120 && p.approvalRate >= 0.90) {
      return {
        payer: p.payer,
        action: "ESCALATE_RATE_INCREASE",
        rationale: `Strong performance (${(p.approvalRate * 100).toFixed(0)}% approval, $${p.avgRevenue.toFixed(0)} avg). Negotiate rate increase at next contract renewal.`,
        priority: "LOW",
      };
    }

    return {
      payer: p.payer,
      action: "MAINTAIN_CONTRACT",
      rationale: `Performance within acceptable range (${(p.approvalRate * 100).toFixed(0)}% approval, $${p.avgRevenue.toFixed(0)} avg).`,
      priority: "LOW",
    };
  });
}
