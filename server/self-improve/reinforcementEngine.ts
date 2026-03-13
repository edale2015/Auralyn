import * as fs from "fs/promises";
import * as path from "path";

export interface RLState {
  complaint: string;
  disposition: string;
  symptomCount: number;
  redFlagsPresent: boolean;
  modifiersPresent: boolean;
}

export interface RLUpdate {
  stateKey: string;
  action: string;
  reward: number;
  timestamp: string;
}

export interface PolicyStats {
  stateKey: string;
  action: string;
  qValue: number;
  updateCount: number;
  avgReward: number;
  lastUpdated: string;
}

const RL_PATH = path.join(process.cwd(), "data", "rl_policy.json");
const RL_HISTORY_PATH = path.join(process.cwd(), "data", "rl_history.ndjson");

interface QTable {
  q: Record<string, number>;
  counts: Record<string, number>;
  totalRewards: Record<string, number>;
  lastUpdated: Record<string, string>;
}

let qtable: QTable = { q: {}, counts: {}, totalRewards: {}, lastUpdated: {} };
let loaded = false;
const ALPHA = 0.1;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await fs.readFile(RL_PATH, "utf8");
    qtable = JSON.parse(raw);
  } catch {}
  loaded = true;
}

async function persist(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(RL_PATH, JSON.stringify(qtable, null, 2), "utf8");
}

export function stateKey(state: RLState): string {
  return `${state.complaint}|${state.disposition}|sc${state.symptomCount > 3 ? "hi" : "lo"}|rf${state.redFlagsPresent ? 1 : 0}|mod${state.modifiersPresent ? 1 : 0}`;
}

export async function updateQ(state: RLState, action: string, reward: number): Promise<void> {
  await load();
  const key = `${stateKey(state)}::${action}`;
  const old = qtable.q[key] ?? 0;
  qtable.q[key] = old + ALPHA * (reward - old);
  qtable.counts[key] = (qtable.counts[key] ?? 0) + 1;
  qtable.totalRewards[key] = (qtable.totalRewards[key] ?? 0) + reward;
  qtable.lastUpdated[key] = new Date().toISOString();
  await persist();
  const histLine = JSON.stringify({ stateKey: stateKey(state), action, reward, timestamp: new Date().toISOString() } as RLUpdate) + "\n";
  await fs.appendFile(RL_HISTORY_PATH, histLine, "utf8").catch(() => {});
}

export async function bestAction(state: RLState, actions: string[]): Promise<string> {
  await load();
  const sk = stateKey(state);
  let best = actions[0];
  let bestQ = -Infinity;
  for (const action of actions) {
    const key = `${sk}::${action}`;
    const q = qtable.q[key] ?? 0;
    if (q > bestQ) { bestQ = q; best = action; }
  }
  return best;
}

export async function getPolicyStats(complaint?: string): Promise<PolicyStats[]> {
  await load();
  return Object.entries(qtable.q)
    .filter(([key]) => !complaint || key.startsWith(`${complaint}|`))
    .map(([key, qValue]) => {
      const [stateK, action] = key.split("::");
      return {
        stateKey: stateK,
        action: action ?? key,
        qValue: Math.round(qValue * 1000) / 1000,
        updateCount: qtable.counts[key] ?? 0,
        avgReward: qtable.counts[key] ? Math.round((qtable.totalRewards[key] / qtable.counts[key]) * 1000) / 1000 : 0,
        lastUpdated: qtable.lastUpdated[key] ?? "",
      };
    })
    .sort((a, b) => b.qValue - a.qValue)
    .slice(0, 50);
}

export const REWARD_CORRECT_DISPOSITION = 1.0;
export const REWARD_SAFE_IMPROVEMENT = 0.5;
export const REWARD_MISSED_RED_FLAG = -2.0;
export const REWARD_UNDERTRIAGE = -1.0;
export const REWARD_OVERTRIAGE = -0.5;

export function computeReward(
  predictedDisposition: string,
  expectedDisposition: string,
  dangerousMiss: boolean
): number {
  if (dangerousMiss) return REWARD_MISSED_RED_FLAG;
  if (predictedDisposition === expectedDisposition) return REWARD_CORRECT_DISPOSITION;
  const sev: Record<string, number> = { home_care: 0, routine: 1, urgent_care: 2, er_now: 3 };
  const pred = sev[predictedDisposition] ?? 1;
  const exp = sev[expectedDisposition] ?? 1;
  if (pred < exp) return REWARD_UNDERTRIAGE * (exp - pred);
  if (pred > exp) return REWARD_OVERTRIAGE * (pred - exp);
  return REWARD_SAFE_IMPROVEMENT;
}
