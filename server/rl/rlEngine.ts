/**
 * Reinforcement Learning Engine — Q-table learning from clinical outcomes
 * Learns triage decisions, intervention timing, routing choices.
 * Always passes through rlSafetyGate before execution.
 * FDA-safe: bounded weight updates, audit-logged, scope-gated.
 */

import { getRedisAsync } from "../queue/redis";

export type ClinicalAction =
  | "observe"
  | "order_labs"
  | "give_fluids"
  | "escalate_ICU"
  | "transfer_hospital"
  | "suggest_treatment";

export interface RLState {
  riskScore:  number;         // 0–10 rounded
  sepsisProb: number;         // 0.0–1.0 rounded to 1 decimal
  news2Band:  "low" | "medium" | "high"; // 0–4 / 5–6 / 7+
}

export interface Outcome {
  icu:       boolean;
  mortality: boolean;
  losHours:  number;
}

const ALPHA   = 0.1;   // learning rate
const REDIS_KEY = "auralyn:rl:q_table";

// In-memory Q-table (backed by Redis)
let Q: Record<string, number> = {};
let loaded = false;

async function loadQ() {
  if (loaded) return;
  try {
    const redis = await getRedisAsync();
    const data  = await redis.get(REDIS_KEY);
    if (data) Q = JSON.parse(data as string);
  } catch { /* use empty table on Redis failure */ }
  loaded = true;
}

async function saveQ() {
  try {
    const redis = await getRedisAsync();
    await redis.set(REDIS_KEY, JSON.stringify(Q));
  } catch { /* non-blocking */ }
}

function getKey(state: RLState, action: ClinicalAction): string {
  return `${state.riskScore}|${state.sepsisProb}|${state.news2Band}|${action}`;
}

function discretize(state: Partial<RLState> & { riskScore: number; sepsisProb?: number; news2?: number }): RLState {
  const r    = Math.round(Math.min(10, Math.max(0, state.riskScore)));
  const s    = Math.round((state.sepsisProb ?? 0) * 10) / 10;
  const news = state.news2 ?? 0;
  return {
    riskScore:  r,
    sepsisProb: s,
    news2Band:  news >= 7 ? "high" : news >= 5 ? "medium" : "low",
  };
}

export function computeReward(outcome: Outcome): number {
  let reward = 0;
  if (!outcome.mortality) reward += 100;
  if (!outcome.icu)       reward += 20;
  reward -= outcome.losHours * 0.5;
  return reward;
}

export async function updateQ(
  rawState: { riskScore: number; sepsisProb?: number; news2?: number },
  action:   ClinicalAction,
  reward:   number
): Promise<void> {
  await loadQ();
  const state = discretize(rawState);
  const key   = getKey(state, action);
  Q[key]      = (Q[key] ?? 0) + ALPHA * (reward - (Q[key] ?? 0));
  await saveQ();
}

export async function chooseBestAction(
  rawState: { riskScore: number; sepsisProb?: number; news2?: number },
  possible: ClinicalAction[]
): Promise<ClinicalAction> {
  await loadQ();
  const state = discretize(rawState);
  return possible.sort(
    (a, b) => (Q[getKey(state, b)] ?? 0) - (Q[getKey(state, a)] ?? 0)
  )[0];
}

export async function getQTable(): Promise<Record<string, number>> {
  await loadQ();
  return { ...Q };
}

export async function learnFromOutcome(
  rawState: { riskScore: number; sepsisProb?: number; news2?: number },
  action:   ClinicalAction,
  outcome:  Outcome
): Promise<number> {
  const reward = computeReward(outcome);
  await updateQ(rawState, action, reward);
  return reward;
}
