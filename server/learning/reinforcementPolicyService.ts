import * as fs from "fs/promises";
import * as path from "path";

export interface PolicyEntry {
  complaint: string;
  avgReward: number;
  totalReward: number;
  count: number;
  winRate: number;
  safetyMisses: number;
  lastTrained: string;
  trend: "improving" | "stable" | "degrading";
}

export interface PolicySnapshot {
  trainedAt: string;
  totalCasesUsed: number;
  policy: PolicyEntry[];
  version: number;
}

const POLICY_FILE = path.join(process.cwd(), "rl_policy.json");
const POLICY_HISTORY_FILE = path.join(process.cwd(), "rl_policy_history.ndjson");

async function loadCurrentPolicy(): Promise<PolicySnapshot | null> {
  try {
    const raw = await fs.readFile(POLICY_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function savePolicy(snapshot: PolicySnapshot): Promise<void> {
  await fs.writeFile(POLICY_FILE, JSON.stringify(snapshot, null, 2));
  await fs.appendFile(POLICY_HISTORY_FILE, JSON.stringify(snapshot) + "\n");
}

async function getPolicyHistory(): Promise<PolicySnapshot[]> {
  try {
    const raw = await fs.readFile(POLICY_HISTORY_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).reverse().slice(0, 10);
  } catch {
    return [];
  }
}

async function loadOutcomeData(): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "patient_outcomes.ndjson"), "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

function computeReward(outcome: any): number {
  let reward = 0;
  if (outcome.actualDisposition === outcome.engineDisposition) reward += 1;
  if (outcome.followupStatus === "improved") reward += 1;
  if (outcome.followupStatus === "worsened") reward -= 1;
  if (outcome.followupStatus === "hospitalized" && outcome.engineDisposition !== "ED") reward -= 2;
  if (outcome.followupStatus === "hospitalized" && outcome.engineDisposition === "ED") reward += 1;
  return reward;
}

export async function trainDispositionPolicy(): Promise<PolicySnapshot> {
  const outcomes = await loadOutcomeData();
  const current = await loadCurrentPolicy();
  const currentVersion = current?.version ?? 0;

  const perComplaint: Record<string, { rewards: number[]; safetyMisses: number }> = {};

  for (const o of outcomes) {
    const c = o.complaint ?? "unknown";
    perComplaint[c] ??= { rewards: [], safetyMisses: 0 };
    const reward = computeReward(o);
    perComplaint[c].rewards.push(reward);
    if (o.followupStatus === "hospitalized" && o.engineDisposition !== "ED") {
      perComplaint[c].safetyMisses++;
    }
  }

  const COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];

  const policy: PolicyEntry[] = COMPLAINTS.map(complaint => {
    const data = perComplaint[complaint];
    if (!data || data.rewards.length === 0) {
      return {
        complaint,
        avgReward: 0,
        totalReward: 0,
        count: 0,
        winRate: 0,
        safetyMisses: 0,
        lastTrained: new Date().toISOString(),
        trend: "stable" as const,
      };
    }
    const totalReward = data.rewards.reduce((a, b) => a + b, 0);
    const avgReward = totalReward / data.rewards.length;
    const winRate = data.rewards.filter(r => r > 0).length / data.rewards.length;
    const prevEntry = current?.policy.find(p => p.complaint === complaint);
    const trend: PolicyEntry["trend"] =
      !prevEntry ? "stable" :
      avgReward > prevEntry.avgReward + 0.1 ? "improving" :
      avgReward < prevEntry.avgReward - 0.1 ? "degrading" : "stable";

    return { complaint, avgReward: Math.round(avgReward * 100) / 100, totalReward: Math.round(totalReward * 100) / 100, count: data.rewards.length, winRate: Math.round(winRate * 100) / 100, safetyMisses: data.safetyMisses, lastTrained: new Date().toISOString(), trend };
  });

  const snapshot: PolicySnapshot = {
    trainedAt: new Date().toISOString(),
    totalCasesUsed: outcomes.length,
    policy,
    version: currentVersion + 1,
  };

  await savePolicy(snapshot);
  return snapshot;
}

export async function getCurrentPolicy(): Promise<PolicySnapshot | null> {
  return loadCurrentPolicy();
}

export async function getPolicyHistoryLog(): Promise<PolicySnapshot[]> {
  return getPolicyHistory();
}

export async function getPolicySummary() {
  const current = await loadCurrentPolicy();
  if (!current) return { trained: false, version: 0, totalCases: 0, policy: [] };
  const top = [...current.policy].sort((a, b) => b.avgReward - a.avgReward)[0];
  const worst = [...current.policy].sort((a, b) => a.avgReward - b.avgReward)[0];
  return {
    trained: true,
    version: current.version,
    totalCases: current.totalCasesUsed,
    trainedAt: current.trainedAt,
    topPerformer: top?.complaint,
    worstPerformer: worst?.complaint,
    avgSystemReward: Math.round((current.policy.reduce((s, p) => s + p.avgReward, 0) / current.policy.length) * 100) / 100,
  };
}
