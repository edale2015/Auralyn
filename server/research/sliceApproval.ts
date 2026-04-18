/**
 * server/research/sliceApproval.ts
 * Human approval gate for slice proposals.
 *
 * Only allows approval if:
 *   1. The proposal exists
 *   2. validationStatus === "passed"
 *   3. approvedBy is a non-empty string (physician or admin identity)
 */

import { db }             from "../db";
import { sliceProposals } from "../../shared/schema";
import { eq }             from "drizzle-orm";

export async function approveSliceProposal(
  proposalId: number,
  approvedBy:  string,
): Promise<{ ok: boolean; proposalId: number }> {
  if (!approvedBy?.trim()) {
    throw new Error("approvedBy is required — must be a physician or admin identity");
  }

  const rows = await db
    .select()
    .from(sliceProposals)
    .where(eq(sliceProposals.id, proposalId));

  const proposal = rows[0];
  if (!proposal) throw new Error(`Slice proposal ${proposalId} not found`);

  if (proposal.validationStatus !== "passed") {
    throw new Error(
      `Cannot approve proposal ${proposalId} — validation status is "${proposal.validationStatus}", must be "passed"`,
    );
  }

  if (proposal.approved) {
    throw new Error(`Proposal ${proposalId} is already approved`);
  }

  await db
    .update(sliceProposals)
    .set({ approved: true, approvedBy: approvedBy.trim() })
    .where(eq(sliceProposals.id, proposalId));

  return { ok: true, proposalId };
}

export async function rejectSliceProposal(
  proposalId: number,
  rejectedBy:  string,
  reason:      string,
): Promise<{ ok: boolean }> {
  const rows = await db
    .select()
    .from(sliceProposals)
    .where(eq(sliceProposals.id, proposalId));

  const proposal = rows[0];
  if (!proposal) throw new Error(`Slice proposal ${proposalId} not found`);
  if (proposal.approved) throw new Error("Cannot reject an already-approved proposal");

  await db
    .update(sliceProposals)
    .set({ validationStatus: "rejected" })
    .where(eq(sliceProposals.id, proposalId));

  return { ok: true };
}
