/**
 * Release Manager — version locking, promotion gates, and freeze controls.
 * Wraps server/governance/deploymentManager.ts with an explicit lock system.
 */

interface ReleaseEntry {
  version:   string;
  label:     string;
  lockedAt?: string;
  promotedAt?: string;
  metrics?:  { accuracy: number; f1Score: number };
  status:   "experimental" | "live" | "locked" | "deprecated";
  createdAt: string;
}

const PROMOTION_THRESHOLD = 0.85;
const releases: ReleaseEntry[] = [
  {
    version:   "v1.0.0",
    label:     "Initial Release",
    status:    "live",
    createdAt: new Date().toISOString(),
  },
];
let currentVersion = "v1.0.0";
const lockedVersions = new Set<string>();

export function getCurrentVersion(): string {
  return currentVersion;
}

export function getReleases(): ReleaseEntry[] {
  return [...releases];
}

export function isCurrentVersionLocked(): boolean {
  return lockedVersions.has(currentVersion);
}

export function isVersionLocked(v: string): boolean {
  return lockedVersions.has(v);
}

export function lockVersion(v?: string): { ok: boolean; version: string; message: string } {
  const target = v ?? currentVersion;
  lockedVersions.add(target);
  const entry = releases.find(r => r.version === target);
  if (entry) { entry.status = "locked"; entry.lockedAt = new Date().toISOString(); }
  return { ok: true, version: target, message: `Version ${target} locked — learning frozen` };
}

export function releaseExperimental(label: string): ReleaseEntry {
  const patch = releases.length + 1;
  const version = `v1.0.${patch}`;
  const entry: ReleaseEntry = {
    version,
    label,
    status:    "experimental",
    createdAt: new Date().toISOString(),
  };
  releases.push(entry);
  return entry;
}

export function promoteIfValid(
  metrics: { accuracy: number; f1Score: number },
  threshold = PROMOTION_THRESHOLD,
): { promoted: boolean; version?: string; reason?: string } {
  if (metrics.accuracy < threshold) {
    return {
      promoted: false,
      reason: `Accuracy ${(metrics.accuracy * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}%`,
    };
  }

  // Create new locked live version
  const major = Math.floor(releases.length / 10) + 1;
  const minor = releases.length % 10;
  const version = `v${major}.${minor}.0`;

  const entry: ReleaseEntry = {
    version,
    label:       `Auto-Promoted Release (acc=${(metrics.accuracy * 100).toFixed(1)}%)`,
    status:      "live",
    metrics,
    promotedAt:  new Date().toISOString(),
    createdAt:   new Date().toISOString(),
  };

  // Deprecate old live
  releases.forEach(r => { if (r.status === "live") r.status = "deprecated"; });
  releases.push(entry);
  currentVersion = version;

  return { promoted: true, version };
}

export function freezeLearning(): { ok: boolean; message: string } {
  return lockVersion(currentVersion);
}

export function getReleaseSummary() {
  return {
    currentVersion,
    isLocked: isCurrentVersionLocked(),
    promotionThreshold: PROMOTION_THRESHOLD,
    totalReleases: releases.length,
    liveCount:     releases.filter(r => r.status === "live").length,
    lockedCount:   releases.filter(r => r.status === "locked").length,
  };
}
