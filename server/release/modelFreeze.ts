/**
 * Model Freeze + Version Lock
 *
 * Provides a lightweight API to freeze / unfreeze the clinical model.
 * When frozen:
 *   - canLearn() returns false → AutonomousLoop / SelfLearning / RLHF skip their update step
 *   - The FDA dashboard "Learning" section shows "FROZEN"
 *
 * Integrates with the existing releaseManager.ts freeze mechanism
 * and exposes additional per-version locking for regulatory submissions.
 */

import {
  freezeLearning as releaseManagerFreeze,
  isCurrentVersionLocked,
  lockVersion,
  getCurrentVersion,
  getReleases,
} from "./releaseManager";

import { logEvent } from "../ops/auditEvents";

// ── Process-level freeze flag (fast path) ────────────────────────────────────
let _localFrozen = false;
let _frozenAt: string | null = null;
let _frozenBy: string | null = null;
let _freezeReason: string | null = null;

export interface FreezeStatus {
  frozen:      boolean;
  frozenAt?:   string;
  frozenBy?:   string;
  reason?:     string;
  version:     string;
  versionLocked: boolean;
}

/**
 * Returns true if learning is currently blocked.
 * Checks both the process-level flag and the release manager's version lock.
 */
export function canLearn(): boolean {
  if (_localFrozen) return false;
  if (isCurrentVersionLocked()) return false;
  return true;
}

/**
 * Freeze the model — blocks all autonomous learning immediately.
 */
export function freezeModel(options?: {
  actor?:  string;
  reason?: string;
  lockVersion?: boolean;
}): FreezeStatus {
  _localFrozen    = true;
  _frozenAt       = new Date().toISOString();
  _frozenBy       = options?.actor  ?? "system";
  _freezeReason   = options?.reason ?? "Manual freeze";

  logEvent({
    type:     "ADMIN_ACTION",
    actor:    _frozenBy,
    severity: "warn",
    payload:  { action: "MODEL_FROZEN", reason: _freezeReason, version: getCurrentVersion() },
  });

  if (options?.lockVersion) {
    releaseManagerFreeze();
  }

  return getStatus();
}

/**
 * Unfreeze the model — re-enables learning.
 * Note: a version-locked release can only be unfrozen by creating a new version.
 */
export function unfreezeModel(options?: { actor?: string }): FreezeStatus {
  _localFrozen  = false;
  _frozenAt     = null;
  _frozenBy     = null;
  _freezeReason = null;

  logEvent({
    type:    "ADMIN_ACTION",
    actor:   options?.actor ?? "system",
    severity: "info",
    payload: { action: "MODEL_UNFROZEN", version: getCurrentVersion() },
  });

  return getStatus();
}

/** Freeze + lock the current version permanently (for regulatory submission) */
export function lockForSubmission(options: { actor: string; reason: string }): FreezeStatus {
  const status = freezeModel({ ...options, lockVersion: true });
  lockVersion(); // also lock via release manager
  return status;
}

export function getStatus(): FreezeStatus {
  return {
    frozen:        _localFrozen || isCurrentVersionLocked(),
    frozenAt:      _frozenAt   ?? undefined,
    frozenBy:      _frozenBy   ?? undefined,
    reason:        _freezeReason ?? undefined,
    version:       getCurrentVersion(),
    versionLocked: isCurrentVersionLocked(),
  };
}

export function getReleaseHistory() {
  return getReleases();
}
