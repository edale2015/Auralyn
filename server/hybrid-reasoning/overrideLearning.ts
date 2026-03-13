import * as fs from "fs/promises";
import * as path from "path";
import { updateProbabilisticFromOutcome } from "./hybridController";
import { recordOutcome } from "../self-improve/learningAdapter";

const OVERRIDES_FILE = path.join("data", "physician_overrides.ndjson");

export interface PhysicianOverride {
  caseId: string;
  complaint: string;
  features: string[];
  ai_disposition: string;
  ai_top_diagnosis: string;
  physician_disposition: string;
  physician_diagnosis?: string;
  override_reason?: string;
  reward: number;
  timestamp: string;
}

export interface OverrideStats {
  total_overrides: number;
  override_rate_estimate: string;
  by_ai_disposition: Record<string, number>;
  by_physician_disposition: Record<string, number>;
  avg_reward: number;
  common_downgrade: string;
  common_upgrade: string;
  recent: PhysicianOverride[];
}

function computeReward(aiDisposition: string, physicianDisposition: string): number {
  const severity: Record<string, number> = {
    er_now: 4, urgent_care: 3, routine: 2, home_care: 1, uncertain: 0,
  };
  const aiLevel = severity[aiDisposition] ?? 2;
  const physLevel = severity[physicianDisposition] ?? 2;
  const diff = physLevel - aiLevel;

  if (diff === 0) return 1;
  if (diff === 1) return 0.5;
  if (diff === -1) return -0.5;
  if (diff >= 2) return -2;
  return -1;
}

export async function recordOverride(
  caseId: string,
  complaint: string,
  features: string[],
  aiDisposition: string,
  aiTopDiagnosis: string,
  physicianDisposition: string,
  physicianDiagnosis?: string,
  overrideReason?: string
): Promise<PhysicianOverride> {
  await fs.mkdir("data", { recursive: true });

  const reward = computeReward(aiDisposition, physicianDisposition);

  const override: PhysicianOverride = {
    caseId, complaint, features,
    ai_disposition: aiDisposition,
    ai_top_diagnosis: aiTopDiagnosis,
    physician_disposition: physicianDisposition,
    physician_diagnosis: physicianDiagnosis,
    override_reason: overrideReason,
    reward,
    timestamp: new Date().toISOString(),
  };

  await fs.appendFile(OVERRIDES_FILE, JSON.stringify(override) + "\n", "utf8");

  await recordOutcome(caseId, "hybrid_controller", features, reward);
  await recordOutcome(caseId, "disposition_layer", [complaint, aiDisposition], reward);

  if (physicianDiagnosis) {
    updateProbabilisticFromOutcome(features, physicianDiagnosis);
    await recordOutcome(caseId, "predictive_risk_model", features, reward);
  }

  return override;
}

export async function getOverrideStats(): Promise<OverrideStats> {
  let overrides: PhysicianOverride[] = [];
  try {
    const raw = await fs.readFile(OVERRIDES_FILE, "utf8");
    overrides = raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {}

  const byAi: Record<string, number> = {};
  const byPhys: Record<string, number> = {};
  const upgrades: Record<string, number> = {};
  const downgrades: Record<string, number> = {};
  let totalReward = 0;

  const severity: Record<string, number> = { er_now: 4, urgent_care: 3, routine: 2, home_care: 1 };

  for (const o of overrides) {
    byAi[o.ai_disposition] = (byAi[o.ai_disposition] ?? 0) + 1;
    byPhys[o.physician_disposition] = (byPhys[o.physician_disposition] ?? 0) + 1;
    totalReward += o.reward;
    if ((severity[o.physician_disposition] ?? 2) > (severity[o.ai_disposition] ?? 2)) {
      upgrades[o.ai_disposition] = (upgrades[o.ai_disposition] ?? 0) + 1;
    } else if ((severity[o.physician_disposition] ?? 2) < (severity[o.ai_disposition] ?? 2)) {
      downgrades[o.ai_disposition] = (downgrades[o.ai_disposition] ?? 0) + 1;
    }
  }

  const topUpgrade = Object.entries(upgrades).sort((a, b) => b[1] - a[1])[0];
  const topDowngrade = Object.entries(downgrades).sort((a, b) => b[1] - a[1])[0];

  return {
    total_overrides: overrides.length,
    override_rate_estimate: overrides.length > 0 ? `${overrides.length} recorded overrides` : "No overrides yet",
    by_ai_disposition: byAi,
    by_physician_disposition: byPhys,
    avg_reward: overrides.length > 0 ? Math.round((totalReward / overrides.length) * 100) / 100 : 0,
    common_downgrade: topDowngrade ? `AI said ${topDowngrade[0]} but physician downgraded (×${topDowngrade[1]})` : "None",
    common_upgrade: topUpgrade ? `AI said ${topUpgrade[0]} but physician upgraded (×${topUpgrade[1]})` : "None",
    recent: overrides.slice(-5).reverse(),
  };
}
