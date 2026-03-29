import { canLearn } from "../release/modelFreeze";
import { getDriftState } from "./driftControl";
import { logSecureEvent } from "../ops/secureAudit";

export interface WeightUpdateProposal {
  proposalId: string;
  diagnosisKey: string;
  delta: number;
  rationale: string;
  proposedBy: string;
  proposedAt: string;
  outcome?: string;
}

export interface ModelVersion {
  versionId: string;
  appliedAt: string;
  approvedBy: string;
  updatesCount: number;
  proposalIds: string[];
  notes?: string;
}

const pendingProposals: WeightUpdateProposal[] = [];
const modelVersions: ModelVersion[] = [];
let rejectedCount = 0;

export function proposeWeightUpdate(proposal: {
  diagnosisKey: string;
  delta: number;
  rationale: string;
  proposedBy: string;
  outcome?: string;
}): { accepted: boolean; proposalId: string; reason?: string } {
  if (!canLearn()) {
    return { accepted: false, proposalId: "", reason: "model_frozen" };
  }
  const drift = getDriftState();
  if (drift.locked) {
    return { accepted: false, proposalId: "", reason: "model_drift_locked" };
  }

  const proposalId = `PROP-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  pendingProposals.push({
    proposalId,
    diagnosisKey:  proposal.diagnosisKey,
    delta:         proposal.delta,
    rationale:     proposal.rationale,
    proposedBy:    proposal.proposedBy,
    proposedAt:    new Date().toISOString(),
    outcome:       proposal.outcome,
  });

  logSecureEvent({ type: "RLHF_PROPOSAL_QUEUED", proposalId, ...proposal });
  return { accepted: true, proposalId };
}

export function approveProposals(approvedBy: string, notes?: string): ModelVersion | null {
  if (pendingProposals.length === 0) return null;

  const version: ModelVersion = {
    versionId:    `v${Date.now()}`,
    appliedAt:    new Date().toISOString(),
    approvedBy,
    updatesCount: pendingProposals.length,
    proposalIds:  pendingProposals.map((p) => p.proposalId),
    notes,
  };

  modelVersions.push(version);
  const cleared = pendingProposals.splice(0, pendingProposals.length);

  logSecureEvent({ type: "RLHF_VERSION_APPROVED", versionId: version.versionId, approvedBy, count: cleared.length });
  return version;
}

export function rejectProposals(rejectedBy: string, reason: string): number {
  const count = pendingProposals.length;
  pendingProposals.splice(0, pendingProposals.length);
  rejectedCount += count;
  logSecureEvent({ type: "RLHF_PROPOSALS_REJECTED", rejectedBy, reason, count });
  return count;
}

export function rollbackVersion(versionId: string, rolledBackBy: string): boolean {
  const idx = modelVersions.findIndex((v) => v.versionId === versionId);
  if (idx === -1) return false;
  const [removed] = modelVersions.splice(idx, 1);
  logSecureEvent({ type: "RLHF_ROLLBACK", versionId, rolledBackBy, updatesCount: removed.updatesCount });
  return true;
}

export function getPendingProposals(): WeightUpdateProposal[] {
  return [...pendingProposals];
}

export function getModelVersions(): ModelVersion[] {
  return [...modelVersions].reverse();
}

export function getVersionedRLHFStats() {
  return {
    active:          true,
    pendingCount:    pendingProposals.length,
    approvedVersions:modelVersions.length,
    rejectedCount,
    latestVersion:   modelVersions[modelVersions.length - 1]?.versionId ?? null,
  };
}
