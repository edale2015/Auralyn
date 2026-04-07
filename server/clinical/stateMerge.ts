/**
 * Packet 15 — State Merge Helper
 *
 * mergeState() replaces raw Object.assign(state, update) with three
 * hardened guarantees:
 *
 *   1. Unknown-field rejection — a node cannot silently add an arbitrary
 *      field that isn't part of the current CaseState shape.
 *   2. Field-ownership enforcement (opt-in) — when enforceOwnership=true,
 *      a node can only write the fields listed in NODE_FIELD_OWNERSHIP.
 *   3. Immutability — returns a new state object; never mutates in place.
 *
 * Usage:
 *   const next = mergeState(current, update, "SCORING");
 *   const next = mergeState(current, update, "RED_FLAG_GATE", true); // strict
 */

import type { CaseState } from "../../shared/agentTypes";
import type { NodeId } from "../services/complaintNodeRunner";
import { assertNodeOwnsField } from "./nodeEngineRegistry";

export type NodeUpdate = Partial<CaseState>;

export function mergeState(
  current: CaseState,
  update: NodeUpdate,
  nodeId: NodeId,
  enforceOwnership = false,
): CaseState {
  const next = { ...current };

  for (const rawKey of Object.keys(update)) {
    const key = rawKey as keyof CaseState;

    // ── Guard 1: unknown field rejection ──────────────────────────────────
    if (!(rawKey in current)) {
      throw new Error(
        `[State] Node "${nodeId}" attempted to write unknown field "${rawKey}" — not in CaseState`,
      );
    }

    // ── Guard 2: field ownership enforcement (opt-in) ─────────────────────
    if (enforceOwnership) {
      assertNodeOwnsField(nodeId, rawKey);
    }

    (next as any)[key] = (update as any)[key];
  }

  return next;
}
