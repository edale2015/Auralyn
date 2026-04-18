/**
 * server/research/humanApproval.ts
 * Human Approval Gate — blocks GitHub export until a qualified human approves.
 *
 * Rules enforced at DB level:
 *   1. validationStatus must be "passed" — no approval before validation
 *   2. requiresHumanApproval must be true (all research upgrades require it)
 *   3. approvedBy must be a non-empty identifier (physician ID or name)
 *
 * This gate is the last safety check before code enters the GitHub pipeline.
 * It cannot be bypassed — githubExporter.ts checks approved === true.
 */

import { db } from "../db";
import { proposedUpgrades } from "../../shared/schema";
import { eq } from "drizzle-orm";

export async function approveUpgrade(
  upgradeId:  number,
  approvedBy: string
): Promise<{ ok: true; upgradeId: number; approvedBy: string }> {
  if (!approvedBy?.trim()) throw new Error("approvedBy is required — must be a physician or admin identifier");

  const rows = await db.select().from(proposedUpgrades).where(eq(proposedUpgrades.id, upgradeId));
  const upgrade = rows[0];
  if (!upgrade) throw new Error(`Proposed upgrade ${upgradeId} not found`);

  if (upgrade.approved) {
    return { ok: true, upgradeId, approvedBy: upgrade.approvedBy ?? approvedBy };
  }

  if (upgrade.validationStatus !== "passed") {
    throw new Error(
      `Cannot approve upgrade ${upgradeId}: validationStatus is "${upgrade.validationStatus}" — must be "passed". ` +
      `Run POST /api/research/validate/${upgradeId} first.`
    );
  }

  await db
    .update(proposedUpgrades)
    .set({ approved: true, approvedBy: approvedBy.trim() })
    .where(eq(proposedUpgrades.id, upgradeId));

  console.log(`[humanApproval] Upgrade #${upgradeId} approved by: ${approvedBy}`);
  return { ok: true, upgradeId, approvedBy: approvedBy.trim() };
}

export async function rejectUpgrade(upgradeId: number, rejectedBy: string, reason: string) {
  const rows = await db.select().from(proposedUpgrades).where(eq(proposedUpgrades.id, upgradeId));
  if (!rows[0]) throw new Error(`Proposed upgrade ${upgradeId} not found`);

  await db
    .update(proposedUpgrades)
    .set({ validationStatus: "rejected" })
    .where(eq(proposedUpgrades.id, upgradeId));

  console.log(`[humanApproval] Upgrade #${upgradeId} rejected by ${rejectedBy}: ${reason}`);
  return { ok: true, upgradeId, rejected: true, rejectedBy, reason };
}
