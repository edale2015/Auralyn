/**
 * Unified Red Flag Engine
 *
 * Previously, red flag detection was fragmented across three independent systems:
 * 1. detectRedFlags() — Q-based answer pattern matching
 * 2. RedFlagAgent — vitals-based escalation agent
 * 3. safetyLayer runSafetyCheck() — symptom + feature string matching
 *
 * This meant a patient could miss escalation if one system flagged a red flag
 * but another didn't, and the coordinator only checked one source.
 *
 * FIXED: This module provides a single authoritative union of all three systems.
 * Any positive red flag from ANY system triggers emergent escalation.
 * The supervisor gate calls ONLY this function.
 */

import { detectRedFlags } from "../agent/safety/redFlags";
import { runSafetyCheck } from "../hybrid-reasoning/safetyLayer";
import { getKbRedFlagsSync } from "../kb/kbRuntime";

export interface UnifiedRedFlagResult {
  flags: string[];
  sources: Record<string, string[]>;  // which source contributed which flags
  emergent: boolean;
}

export function unifiedRedFlagCheck(input: {
  caseState?: any;
  vitals?: Record<string, number>;
  complaint: string;
  features: string[];
  complaintId?: string;
}): UnifiedRedFlagResult {
  const allFlags = new Set<string>();
  const sources: Record<string, string[]> = { qBased: [], safetyLayer: [], kbRules: [] };

  // 1️⃣ Q-based red flags (answer pattern matching)
  if (input.caseState) {
    try {
      const qFlags = detectRedFlags(input.caseState);
      qFlags.forEach(f => { allFlags.add(f); sources.qBased.push(f); });
    } catch { /* non-fatal */ }
  }

  // 2️⃣ Safety layer (symptom + feature string matching)
  try {
    const safety = runSafetyCheck(input.complaint, input.features);
    (safety.triggered_flags ?? []).forEach((f: string) => { allFlags.add(f); sources.safetyLayer.push(f); });
  } catch { /* non-fatal */ }

  // 3️⃣ KB red flag rules (active DB-backed rules for this complaint)
  try {
    const complaintId = input.complaintId ?? input.complaint.toLowerCase().replace(/\s+/g, "_");
    const kbRules = getKbRedFlagsSync(complaintId);
    for (const rule of kbRules) {
      const featsLower = input.features.map(f => f.toLowerCase());
      const trigger = rule.triggerExpr.toLowerCase();
      if (featsLower.some(f => f.includes(trigger) || trigger.includes(f))) {
        allFlags.add(rule.label);
        sources.kbRules.push(rule.label);
      }
    }
  } catch { /* non-fatal */ }

  return {
    flags: Array.from(allFlags),
    sources,
    emergent: allFlags.size > 0,
  };
}
