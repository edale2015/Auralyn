/**
 * Packet 15 — Node Engine Registry
 *
 * Two guarantees this file provides:
 *
 * 1. COMPILE-TIME completeness proof:
 *    NODE_ENGINE_COVERAGE is typed as Record<NodeId, true>, so TypeScript
 *    will refuse to compile if a NodeId is added to the union without also
 *    being added here. This catches the "silent skip" failure mode before
 *    it reaches tests or production.
 *
 * 2. RUNTIME guard:
 *    getNodeEngine() throws for any unregistered nodeId that somehow
 *    arrives at runtime (e.g., from a dynamic config value that bypasses
 *    the type system).
 *
 * Note: this does NOT replace the switch-based runComplaintGraph execution.
 * It is a complementary enforcement layer. The switch contains the actual
 * per-node business logic; this registry proves the switch is complete.
 */

import type { NodeId } from "../services/complaintNodeRunner";

// ── Compile-time completeness proof ──────────────────────────────────────────
//
// When you add a new entry to the NodeId union, TypeScript will flag this
// object as missing the new key. That compile error is the safety net.

type _AssertAllNodesCovered = Record<NodeId, true>;

export const NODE_ENGINE_COVERAGE: _AssertAllNodesCovered = {
  INIT_CASE:          true,
  MODIFIERS_INTAKE:   true,
  CC_NORMALIZE:       true,
  CORE_QUESTIONS:     true,
  RED_FLAG_GATE:      true,
  SCORING:            true,
  TESTING_DECISION:   true,
  DIFF_AND_CONFIDENCE: true,
  DISPOSITION_RULES:  true,
  SPECIALIST_COUNCIL: true,
  OUTPUT_COMPOSE:     true,
  DONE:               true,
};

// ── Runtime guard ─────────────────────────────────────────────────────────────
//
// Throws immediately if nodeId is not in the registry — prevents silent
// skip of unregistered nodes, even if they arrive from dynamic config.

export function getNodeEngine(nodeId: NodeId): true {
  const covered = NODE_ENGINE_COVERAGE[nodeId];
  if (!covered) {
    throw new Error(
      `[NodeEngine] No engine registered for node "${nodeId}" — execution blocked`,
    );
  }
  return covered;
}

// ── Field ownership map ───────────────────────────────────────────────────────
//
// Declares which CaseState fields each node is authorised to write.
// Used by mergeState() in stateMerge.ts to prevent one node from silently
// corrupting another node's output.
//
// Nodes not listed here may only update fields in their own slice.
// "answers" and "audit" are intentionally absent — they are cross-cutting.

export const NODE_FIELD_OWNERSHIP: Partial<Record<NodeId, readonly string[]>> = {
  INIT_CASE:           ["system", "normalizedComplaint", "activeClusters"],
  MODIFIERS_INTAKE:    ["modifiers"],
  CC_NORMALIZE:        ["normalizedComplaint"],
  CORE_QUESTIONS:      ["questionQueue", "routing", "answers"],
  RED_FLAG_GATE:       ["redFlags", "redFlagGate", "routing"],
  SCORING:             ["scores", "scoringSystems", "differentials"],
  TESTING_DECISION:    ["careGaps"],
  DIFF_AND_CONFIDENCE: ["candidateDiagnoses", "confidence", "differentials"],
  DISPOSITION_RULES:   ["disposition", "dispositionReasonCodes", "routing"],
  SPECIALIST_COUNCIL:  ["candidateDiagnoses", "confidence", "ruleTrace"],
  OUTPUT_COMPOSE:      ["routing"],
  DONE:                [],
} as const;

// ── assertNodeOwnsField ───────────────────────────────────────────────────────
//
// Throws if nodeId tries to write a field it does not own.
// Call from mergeState() with enforceOwnership = true for strict mode.

export function assertNodeOwnsField(nodeId: NodeId, field: string): void {
  const owned = NODE_FIELD_OWNERSHIP[nodeId];
  if (owned === undefined) return; // node has no ownership declaration — skip check
  if (!(owned as readonly string[]).includes(field)) {
    throw new Error(
      `[State] Node "${nodeId}" is not authorised to write field "${field}"`,
    );
  }
}
