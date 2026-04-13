/**
 * server/governance/enforcementEngine.ts
 *
 * FIX (Batch-1 Finding #11 — Phase 2): Hard governance enforcement layer.
 * Previously, governance items could be queued but nothing blocked actions
 * while high-risk items were pending. This module provides an enforceGovernance()
 * function that throws if any high-risk item is pending or if an action-specific
 * rule fails.
 *
 * Use the enforce() middleware to gate any route that should respect governance:
 *   router.post("/model/update", enforce("model:update"), handler);
 *   router.post("/rlhf/apply",   enforce("model:update"), handler);
 *   router.post("/clinical/override", enforce("clinical:override"), handler);
 */

import { db }              from "../db";
import { governanceItems } from "../../shared/schema";
import { eq }              from "drizzle-orm";

export interface EnforcementContext {
  action:     string;
  clinicId?:  string;
  payload?:   any;
}

export async function enforceGovernance(ctx: EnforcementContext): Promise<void> {
  // 1. Block if any high-risk governance items are pending
  const pending = await db
    .select()
    .from(governanceItems)
    .where(eq(governanceItems.status, "pending"));

  const highRisk = pending.filter((p) => p.risk === "high");
  if (highRisk.length > 0) {
    throw new Error(
      `GOVERNANCE BLOCKED: ${highRisk.length} high-risk governance item(s) require physician approval before this action can proceed`
    );
  }

  // 2. Action-specific enforcement rules
  if (ctx.action === "model:update") {
    const impact = ctx.payload?.impact ?? ctx.payload?.impactPercent ?? 0;
    if (impact > 0.05 && !ctx.payload?.approved) {
      throw new Error(
        `GOVERNANCE BLOCKED: model update with impact ${(impact * 100).toFixed(1)}% requires physician approval`
      );
    }
  }

  if (ctx.action === "clinical:override") {
    if (!ctx.payload?.physicianId) {
      throw new Error(
        "GOVERNANCE BLOCKED: clinical override must be physician-attributed — physicianId is required"
      );
    }
  }

  if (ctx.action === "rlhf:apply") {
    // RLHF applications that affect high-stakes complaints require approval
    const isHighStakes = ctx.payload?.requiresPhysicianReview === true;
    if (isHighStakes && !ctx.payload?.approved) {
      throw new Error(
        "GOVERNANCE BLOCKED: RLHF proposal requires physician review before application"
      );
    }
  }
}
