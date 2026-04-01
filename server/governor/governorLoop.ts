import { evaluateAgents } from "./agentGovernor";
import { updateRLHFWeights, getRLHFState } from "../warroom/warRoomEngine";
import { getClaimOutcomeStats } from "../billing/claimOutcomeLearning";
import { PRODUCTION_FLAGS } from "../config/productionFlags";
import { db } from "../db";
import { sql } from "drizzle-orm";

let loopActive = false;
let iterationCount = 0;

const DELTA_CAP = PRODUCTION_FLAGS.RLHF_MAX_DELTA_PER_CYCLE;

interface PendingWeightChange {
  id: string;
  proposedAt: string;
  diagnosisWeight: number;
  escalationPenalty: number;
  outcomeWeight: number;
  delta: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

const pendingWeightChanges: PendingWeightChange[] = [];

export function getPendingWeightChanges(): PendingWeightChange[] {
  return [...pendingWeightChanges.filter(c => c.status === "pending")];
}

export function approveWeightChange(id: string): boolean {
  const change = pendingWeightChanges.find(c => c.id === id && c.status === "pending");
  if (!change) return false;
  change.status = "approved";
  updateRLHFWeights({
    diagnosisWeight: change.diagnosisWeight,
    escalationPenalty: change.escalationPenalty,
    outcomeWeight: change.outcomeWeight,
    totalAdjustments: getRLHFState().totalAdjustments + 1,
  });
  persistWeightSnapshot({ ...change, status: "approved" });
  console.log(`[Governor] ✅ Weight change ${id} approved and applied by physician`);
  return true;
}

export function rejectWeightChange(id: string): boolean {
  const change = pendingWeightChanges.find(c => c.id === id && c.status === "pending");
  if (!change) return false;
  change.status = "rejected";
  console.log(`[Governor] ❌ Weight change ${id} rejected`);
  return true;
}

async function persistWeightSnapshot(change: PendingWeightChange): Promise<void> {
  try {
    const state = getRLHFState();
    await db.execute(sql`
      INSERT INTO agent_weight_snapshots
        (snapshot_id, status, proposed_at, diagnosis_weight, escalation_penalty, outcome_weight, delta_magnitude, reason, total_adjustments)
      VALUES
        (${change.id}, ${change.status}, ${change.proposedAt}, ${change.diagnosisWeight}, ${change.escalationPenalty}, ${change.outcomeWeight}, ${change.delta}, ${change.reason}, ${state.totalAdjustments})
      ON CONFLICT (snapshot_id) DO UPDATE
        SET status = EXCLUDED.status
    `);
  } catch (_e) {}
}

export function startGovernorLoop(intervalMs = 30000): void {
  if (loopActive) return;
  loopActive = true;

  ensureSnapshotTable();
  console.log(`[Governor] Autonomous agent governor loop started (interval: ${intervalMs}ms, delta_cap: ±${(DELTA_CAP * 100).toFixed(0)}%)`);

  setInterval(async () => {
    iterationCount++;
    try {
      const statuses = await evaluateAgents();
      const failing = statuses.filter(s => s.health === "failing");
      const degraded = statuses.filter(s => s.health === "degraded");

      if (failing.length > 0) {
        console.log(`[Governor] ⚠️ Iteration ${iterationCount}: ${failing.length} agents FAILING:`, failing.map(a => a.agent).join(", "));
      } else if (degraded.length > 0) {
        console.log(`[Governor] 🟡 Iteration ${iterationCount}: ${degraded.length} agents degraded — monitoring`);
      } else if (iterationCount % 10 === 0) {
        console.log(`[Governor] ✅ Iteration ${iterationCount}: All agents healthy`);
      }

      runRLHFUpdate();
    } catch (e: any) {
      console.error(`[Governor] Loop error on iteration ${iterationCount}:`, e?.message);
    }
  }, intervalMs);
}

function runRLHFUpdate(): void {
  try {
    const stats = getClaimOutcomeStats();

    const totalOutcomes = (stats as any).totalClaims ?? 0;
    const minThreshold = PRODUCTION_FLAGS.RLHF_MIN_OUTCOME_THRESHOLD;

    if (totalOutcomes < minThreshold) {
      if (iterationCount % 5 === 0) {
        console.log(`[Governor] 🔒 RLHF locked — insufficient outcome data (${totalOutcomes}/${minThreshold} minimum). Running on locked initialized weights.`);
      }
      return;
    }

    const current = getRLHFState();
    const paidRate = stats.paidRate || 0.85;
    const escalationRate = stats.denialRate || 0.09;

    const rawDiagnosis   = current.diagnosisWeight   * (1 + (paidRate - 0.85) * 0.05);
    const rawEscalation  = current.escalationPenalty * (1 + (escalationRate - 0.15) * 0.04);
    const rawOutcome     = current.outcomeWeight      * (1 + (paidRate - 0.80) * 0.04);

    const clamp = (raw: number, current: number): number => {
      const delta = raw - current;
      const capped = current + Math.max(-DELTA_CAP, Math.min(DELTA_CAP, delta));
      return Math.max(0.5, Math.min(2.0, Math.round(capped * 1000) / 1000));
    };

    const newDiagnosisWeight   = clamp(rawDiagnosis, current.diagnosisWeight);
    const newEscalationPenalty = clamp(rawEscalation, current.escalationPenalty);
    const newOutcomeWeight     = clamp(rawOutcome, current.outcomeWeight);

    const maxDelta = Math.max(
      Math.abs(newDiagnosisWeight - current.diagnosisWeight),
      Math.abs(newEscalationPenalty - current.escalationPenalty),
      Math.abs(newOutcomeWeight - current.outcomeWeight),
    );

    const autoApply = PRODUCTION_FLAGS.RLHF_AUTO_APPLY && maxDelta < DELTA_CAP * 0.5;

    const change: PendingWeightChange = {
      id: `wc-${Date.now()}`,
      proposedAt: new Date().toISOString(),
      diagnosisWeight: newDiagnosisWeight,
      escalationPenalty: newEscalationPenalty,
      outcomeWeight: newOutcomeWeight,
      delta: maxDelta,
      reason: `Auto-computed: paidRate=${paidRate.toFixed(3)}, escalationRate=${escalationRate.toFixed(3)}`,
      status: autoApply ? "approved" : "pending",
    };

    pendingWeightChanges.push(change);
    if (pendingWeightChanges.length > 200) pendingWeightChanges.shift();

    if (autoApply) {
      updateRLHFWeights({
        diagnosisWeight: newDiagnosisWeight,
        escalationPenalty: newEscalationPenalty,
        outcomeWeight: newOutcomeWeight,
        totalAdjustments: current.totalAdjustments + 1,
      });
      persistWeightSnapshot(change);
    } else {
      console.log(`[Governor] 📋 Weight change queued for physician review (delta=${(maxDelta * 100).toFixed(2)}% exceeds auto-apply threshold)`);
      persistWeightSnapshot(change);
    }
  } catch (_e) {}
}

async function ensureSnapshotTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_weight_snapshots (
        id                SERIAL PRIMARY KEY,
        snapshot_id       TEXT UNIQUE NOT NULL,
        status            TEXT NOT NULL DEFAULT 'pending',
        proposed_at       TEXT NOT NULL,
        diagnosis_weight  NUMERIC NOT NULL,
        escalation_penalty NUMERIC NOT NULL,
        outcome_weight    NUMERIC NOT NULL,
        delta_magnitude   NUMERIC NOT NULL DEFAULT 0,
        reason            TEXT,
        total_adjustments INTEGER NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (_e) {}
}

export function getGovernorStatus() {
  return {
    active: loopActive,
    iterationCount,
    startedAt: loopActive ? new Date(Date.now() - iterationCount * 30000).toISOString() : null,
    deltaCap: DELTA_CAP,
    minOutcomeThreshold: PRODUCTION_FLAGS.RLHF_MIN_OUTCOME_THRESHOLD,
    pendingWeightChanges: pendingWeightChanges.filter(c => c.status === "pending").length,
  };
}
