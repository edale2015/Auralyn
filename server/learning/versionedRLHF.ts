/**
 * Versioned RLHF with Redis-persisted proposal queue.
 *
 * Proposals survive server restarts via Upstash Redis.
 * All weight changes require explicit human approval (never autonomous).
 * Architecture concern addressed: in-memory state replaced with durable storage.
 */

import { canLearn }         from "../release/modelFreeze";
import { getDriftState }    from "./driftControl";
import { logSecureEvent }   from "../ops/secureAudit";
import { getRedisAsync }    from "../queue/redis";

export interface WeightUpdateProposal {
  proposalId:   string;
  diagnosisKey: string;
  delta:        number;
  rationale:    string;
  proposedBy:   string;
  proposedAt:   string;
  outcome?:     string;
}

export interface ModelVersion {
  versionId:    string;
  appliedAt:    string;
  approvedBy:   string;
  updatesCount: number;
  proposalIds:  string[];
  notes?:       string;
}

const REDIS_PROPOSALS_KEY = "rlhf:pending_proposals";
const REDIS_VERSIONS_KEY  = "rlhf:model_versions";
const REDIS_REJECTED_KEY  = "rlhf:rejected_count";

// In-memory mirror (write-through cache — authoritative copy is Redis when available)
const pendingProposals: WeightUpdateProposal[] = [];
const modelVersions: ModelVersion[]            = [];
let rejectedCount = 0;
let _hydrated     = false;

/* ─── Redis persistence helpers ──────────────────────────────────────────── */

async function syncProposals(): Promise<void> {
  try {
    const r = await getRedisAsync();
    if (!r) return;
    await r.set(REDIS_PROPOSALS_KEY, JSON.stringify(pendingProposals));
  } catch { /* non-blocking */ }
}

async function syncVersions(): Promise<void> {
  try {
    const r = await getRedisAsync();
    if (!r) return;
    await r.set(REDIS_VERSIONS_KEY, JSON.stringify(modelVersions));
    await r.set(REDIS_REJECTED_KEY, String(rejectedCount));
  } catch { /* non-blocking */ }
}

/** Called once at server boot to load persisted RLHF state from Redis. */
export async function hydrateFromRedis(): Promise<{ proposals: number; versions: number }> {
  if (_hydrated) return { proposals: pendingProposals.length, versions: modelVersions.length };
  _hydrated = true;

  try {
    const r = await getRedisAsync();
    if (!r) return { proposals: 0, versions: 0 };

    const [rawProposals, rawVersions, rawRejected] = await Promise.all([
      r.get(REDIS_PROPOSALS_KEY),
      r.get(REDIS_VERSIONS_KEY),
      r.get(REDIS_REJECTED_KEY),
    ]);

    if (rawProposals) {
      const parsed: WeightUpdateProposal[] = JSON.parse(typeof rawProposals === "string" ? rawProposals : JSON.stringify(rawProposals));
      pendingProposals.splice(0, pendingProposals.length, ...parsed);
    }
    if (rawVersions) {
      const parsed: ModelVersion[] = JSON.parse(typeof rawVersions === "string" ? rawVersions : JSON.stringify(rawVersions));
      modelVersions.splice(0, modelVersions.length, ...parsed);
    }
    if (rawRejected) {
      rejectedCount = Number(rawRejected) || 0;
    }

    console.log(`[RLHF] Hydrated from Redis — ${pendingProposals.length} pending proposals, ${modelVersions.length} model versions`);
    return { proposals: pendingProposals.length, versions: modelVersions.length };
  } catch (err: any) {
    console.warn("[RLHF] Redis hydration failed (running in-memory only):", err?.message);
    return { proposals: 0, versions: 0 };
  }
}

/* ─── Core API ────────────────────────────────────────────────────────────── */

export function proposeWeightUpdate(proposal: {
  diagnosisKey: string;
  delta:        number;
  rationale:    string;
  proposedBy:   string;
  outcome?:     string;
}): { accepted: boolean; proposalId: string; reason?: string } {
  if (!canLearn()) {
    return { accepted: false, proposalId: "", reason: "model_frozen" };
  }
  const drift = getDriftState();
  if (drift.locked) {
    return { accepted: false, proposalId: "", reason: "model_drift_locked" };
  }

  const proposalId = `PROP-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const p: WeightUpdateProposal = {
    proposalId,
    diagnosisKey: proposal.diagnosisKey,
    delta:        proposal.delta,
    rationale:    proposal.rationale,
    proposedBy:   proposal.proposedBy,
    proposedAt:   new Date().toISOString(),
    outcome:      proposal.outcome,
  };

  pendingProposals.push(p);
  logSecureEvent({ type: "RLHF_PROPOSAL_QUEUED", proposalId, ...proposal });

  // Write-through to Redis (non-blocking)
  syncProposals().catch(() => {});

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
  pendingProposals.splice(0, pendingProposals.length);

  logSecureEvent({ type: "RLHF_VERSION_APPROVED", versionId: version.versionId, approvedBy, count: version.updatesCount });

  // Write-through to Redis (non-blocking)
  syncProposals().catch(() => {});
  syncVersions().catch(() => {});

  return version;
}

export function rejectProposals(rejectedBy: string, reason: string): number {
  const count = pendingProposals.length;
  pendingProposals.splice(0, pendingProposals.length);
  rejectedCount += count;

  logSecureEvent({ type: "RLHF_PROPOSALS_REJECTED", rejectedBy, reason, count });

  syncProposals().catch(() => {});
  syncVersions().catch(() => {});

  return count;
}

export function rollbackVersion(versionId: string, rolledBackBy: string): boolean {
  const idx = modelVersions.findIndex((v) => v.versionId === versionId);
  if (idx === -1) return false;
  const [removed] = modelVersions.splice(idx, 1);

  logSecureEvent({ type: "RLHF_ROLLBACK", versionId, rolledBackBy, updatesCount: removed.updatesCount });
  syncVersions().catch(() => {});

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
    active:           true,
    pendingCount:     pendingProposals.length,
    approvedVersions: modelVersions.length,
    rejectedCount,
    latestVersion:    modelVersions[modelVersions.length - 1]?.versionId ?? null,
    redisHydrated:    _hydrated,
  };
}
