import * as fs from "fs/promises";
import * as path from "path";

const WEIGHTS_FILE = path.join("data", "learning_weights.json");
const OUTCOMES_FILE = path.join("data", "learning_outcomes.ndjson");

const LEARNING_RATE = 0.1;

export interface WeightEntry {
  component: string;
  parameter: string;
  value: number;
  updateCount: number;
  lastUpdated: string;
}

export interface OutcomeRecord {
  caseId: string;
  component: string;
  features: string[];
  reward: number;
  updatedParameters: string[];
  timestamp: string;
}

export interface ComponentWeightSummary {
  component: string;
  parameters: WeightEntry[];
  totalUpdates: number;
  avgReward: number;
  lastUpdated: string;
}

type WeightStore = Record<string, WeightEntry>;

let _weights: WeightStore | null = null;
let _dirty = false;

async function ensureData() {
  try { await fs.mkdir("data", { recursive: true }); } catch {}
}

async function loadWeights(): Promise<WeightStore> {
  if (_weights) return _weights;
  await ensureData();
  try {
    const raw = await fs.readFile(WEIGHTS_FILE, "utf8");
    _weights = JSON.parse(raw);
  } catch {
    _weights = {};
  }
  return _weights!;
}

async function saveWeights(): Promise<void> {
  if (!_dirty || !_weights) return;
  await ensureData();
  await fs.writeFile(WEIGHTS_FILE, JSON.stringify(_weights, null, 2), "utf8");
  _dirty = false;
}

function weightKey(component: string, parameter: string): string {
  return `${component}::${parameter}`;
}

export async function updateWeight(
  component: string,
  parameter: string,
  reward: number
): Promise<WeightEntry> {
  const store = await loadWeights();
  const key = weightKey(component, parameter);
  const existing: WeightEntry = store[key] ?? {
    component,
    parameter,
    value: 0,
    updateCount: 0,
    lastUpdated: new Date().toISOString(),
  };
  const newValue = existing.value + LEARNING_RATE * reward;
  const updated: WeightEntry = {
    ...existing,
    value: Math.max(-10, Math.min(10, newValue)),
    updateCount: existing.updateCount + 1,
    lastUpdated: new Date().toISOString(),
  };
  store[key] = updated;
  _dirty = true;
  await saveWeights();
  return updated;
}

export async function getWeight(
  component: string,
  parameter: string
): Promise<number> {
  const store = await loadWeights();
  return store[weightKey(component, parameter)]?.value ?? 0;
}

export async function getComponentWeights(
  component: string
): Promise<WeightEntry[]> {
  const store = await loadWeights();
  return Object.values(store).filter((e) => e.component === component);
}

export async function recordOutcome(
  caseId: string,
  component: string,
  features: string[],
  reward: number
): Promise<OutcomeRecord> {
  const updatedParameters: string[] = [];
  for (const feature of features) {
    await updateWeight(component, feature, reward);
    updatedParameters.push(feature);
  }
  const record: OutcomeRecord = {
    caseId,
    component,
    features,
    reward,
    updatedParameters,
    timestamp: new Date().toISOString(),
  };
  await ensureData();
  await fs.appendFile(OUTCOMES_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}

export async function getAllComponentSummaries(): Promise<ComponentWeightSummary[]> {
  const store = await loadWeights();
  const byComponent: Record<string, WeightEntry[]> = {};
  for (const entry of Object.values(store)) {
    if (!byComponent[entry.component]) byComponent[entry.component] = [];
    byComponent[entry.component].push(entry);
  }

  let outcomeLines: string[] = [];
  try {
    const raw = await fs.readFile(OUTCOMES_FILE, "utf8");
    outcomeLines = raw.trim().split("\n").filter(Boolean);
  } catch {}

  const rewardsByComponent: Record<string, number[]> = {};
  for (const line of outcomeLines) {
    try {
      const r: OutcomeRecord = JSON.parse(line);
      if (!rewardsByComponent[r.component]) rewardsByComponent[r.component] = [];
      rewardsByComponent[r.component].push(r.reward);
    } catch {}
  }

  return Object.entries(byComponent).map(([component, params]) => {
    const rewards = rewardsByComponent[component] ?? [];
    const avgReward = rewards.length
      ? rewards.reduce((a, b) => a + b, 0) / rewards.length
      : 0;
    const lastUpdated = params
      .map((p) => p.lastUpdated)
      .sort()
      .reverse()[0] ?? "";
    return {
      component,
      parameters: params.sort((a, b) => b.value - a.value),
      totalUpdates: params.reduce((s, p) => s + p.updateCount, 0),
      avgReward: Math.round(avgReward * 100) / 100,
      lastUpdated,
    };
  });
}

export async function getAdapterStats(): Promise<{
  totalWeights: number;
  totalOutcomes: number;
  componentsWithWeights: number;
  learningRate: number;
  topGainers: WeightEntry[];
  topLosers: WeightEntry[];
}> {
  const store = await loadWeights();
  const all = Object.values(store);
  const components = new Set(all.map((e) => e.component));

  let outcomeCount = 0;
  try {
    const raw = await fs.readFile(OUTCOMES_FILE, "utf8");
    outcomeCount = raw.trim().split("\n").filter(Boolean).length;
  } catch {}

  const sorted = [...all].sort((a, b) => b.value - a.value);
  return {
    totalWeights: all.length,
    totalOutcomes: outcomeCount,
    componentsWithWeights: components.size,
    learningRate: LEARNING_RATE,
    topGainers: sorted.slice(0, 5),
    topLosers: sorted.slice(-5).reverse(),
  };
}

// ── Component-specific learning helpers ───────────────────────────────────────

export async function learnClinicalScoring(
  features: string[],
  outcomeReward: number
): Promise<WeightEntry[]> {
  const results: WeightEntry[] = [];
  for (const f of features) {
    const w = await updateWeight("clinical_scoring", f, outcomeReward);
    results.push(w);
  }
  return results;
}

export async function learnCarePathway(
  fromStep: string,
  toStep: string,
  reward: number
): Promise<WeightEntry> {
  const param = `${fromStep}→${toStep}`;
  return updateWeight("care_pathway_executor", param, reward);
}

export async function learnInterfaceWording(
  questionText: string,
  patientUnderstood: boolean
): Promise<WeightEntry> {
  const reward = patientUnderstood ? 1 : -1;
  const key = questionText.slice(0, 60).replace(/\s+/g, "_");
  return updateWeight("patient_interface_agent", key, reward);
}

export async function learnTelemedicineSession(
  complaint: string,
  disposition: string,
  outcomeReward: number
): Promise<WeightEntry> {
  const param = `${complaint}::${disposition}`;
  return updateWeight("telemedicine_session", param, outcomeReward);
}

export async function learnCopilotHint(
  hintCategory: string,
  accepted: boolean
): Promise<WeightEntry> {
  const reward = accepted ? 1 : -0.5;
  return updateWeight("clinician_copilot", hintCategory, reward);
}

export async function learnGoldCaseEval(
  failureType: string,
  wasCorrectlyCaught: boolean
): Promise<WeightEntry> {
  const reward = wasCorrectlyCaught ? 1 : -1;
  return updateWeight("gold_case_evaluator", failureType, reward);
}

export async function learnFailureClassifier(
  predictedType: string,
  wasCorrect: boolean
): Promise<WeightEntry> {
  const reward = wasCorrect ? 1 : -1;
  return updateWeight("failure_classifier", predictedType, reward);
}

export async function learnProposalEngine(
  proposalType: string,
  wasAccepted: boolean
): Promise<WeightEntry> {
  const reward = wasAccepted ? 1 : -0.5;
  return updateWeight("proposal_engine", proposalType, reward);
}
