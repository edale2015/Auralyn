/**
 * Safety Modes
 *
 * Controls how much autonomy the learning system has.
 *
 * observe_only (default):
 *   - Analyze failures, generate suggestions
 *   - Never modify any clinical logic
 *   - All suggestions visible but require explicit manual deploy
 *
 * assisted_learning:
 *   - All suggestions go through manual approval queue
 *   - Low-risk suggestions highlighted for quick approval
 *   - Still no auto-apply
 *
 * controlled_auto:
 *   - Low-risk weight adjustments may auto-apply after 24h with no rejection
 *   - Red flags, medications, pediatric, pregnancy changes ALWAYS manual
 *   - All auto-applies logged with full audit trail
 */

import { logAuditEvent } from "./changeAuditLog";

export type SafetyMode = "observe_only" | "assisted_learning" | "controlled_auto";

export interface SafetyModeState {
  mode:         SafetyMode;
  setAt:        number;
  setBy:        string;
  reason?:      string;
  constraints:  SafetyConstraints;
}

export interface SafetyConstraints {
  requireManualApprovalFor: string[];
  autoApplyAllowed:         boolean;
  autoApplyDelayHours:      number;
  autoApplyMaxRiskLevel:    "low" | "medium" | "none";
}

const MODE_CONSTRAINTS: Record<SafetyMode, SafetyConstraints> = {
  observe_only: {
    requireManualApprovalFor: ["*"],
    autoApplyAllowed:         false,
    autoApplyDelayHours:      999,
    autoApplyMaxRiskLevel:    "none",
  },
  assisted_learning: {
    requireManualApprovalFor: ["red_flag", "medication", "pediatric", "pregnancy", "dosing", "hard_stop"],
    autoApplyAllowed:         false,
    autoApplyDelayHours:      999,
    autoApplyMaxRiskLevel:    "none",
  },
  controlled_auto: {
    requireManualApprovalFor: ["red_flag", "medication", "pediatric", "pregnancy", "dosing", "hard_stop"],
    autoApplyAllowed:         true,
    autoApplyDelayHours:      24,
    autoApplyMaxRiskLevel:    "low",
  },
};

const MODE_DESCRIPTIONS: Record<SafetyMode, string> = {
  observe_only:      "System analyzes and suggests only. Zero automated changes. Full human control.",
  assisted_learning: "Suggestions surface in the approval queue. All changes require manual approval. Red flags, medications, pediatric, and pregnancy rules always require physician review.",
  controlled_auto:   "Low-risk weight adjustments (score <0.3) auto-apply after 24h with no rejection. All red-flag, medication, pediatric, and pregnancy changes still require manual approval.",
};

let current: SafetyModeState = {
  mode:        "observe_only",
  setAt:       Date.now(),
  setBy:       "system",
  reason:      "Default safe mode — requires explicit activation to change",
  constraints: MODE_CONSTRAINTS["observe_only"],
};

export function getCurrentSafetyMode(): SafetyModeState & { description: string } {
  return { ...current, description: MODE_DESCRIPTIONS[current.mode] };
}

export function setSafetyMode(mode: SafetyMode, setBy: string, reason?: string): SafetyModeState {
  const prev = current.mode;
  current = {
    mode,
    setAt:       Date.now(),
    setBy,
    reason,
    constraints: MODE_CONSTRAINTS[mode],
  };
  logAuditEvent({
    action:   "safety_mode_changed",
    source:   "admin",
    actor:    setBy,
    before:   prev,
    after:    mode,
    detail:   reason,
  });
  return current;
}

export function requiresManualApproval(changeType: string): boolean {
  const c = current.constraints;
  if (c.requireManualApprovalFor.includes("*")) return true;
  return c.requireManualApprovalFor.some(r => changeType.toLowerCase().includes(r));
}

export function canAutoApply(riskLevel: "low" | "medium" | "high"): boolean {
  const c = current.constraints;
  if (!c.autoApplyAllowed) return false;
  const levels = { low: 1, medium: 2, high: 3, none: 0 };
  return levels[riskLevel] <= levels[c.autoApplyMaxRiskLevel as "low" | "medium" | "none"];
}

export function listSafetyModes(): Array<{ mode: SafetyMode; description: string; active: boolean }> {
  return (["observe_only", "assisted_learning", "controlled_auto"] as SafetyMode[]).map(m => ({
    mode:        m,
    description: MODE_DESCRIPTIONS[m],
    active:      current.mode === m,
  }));
}
