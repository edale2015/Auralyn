import * as fs from "fs/promises";
import * as path from "path";
import { updateProbabilisticFromOutcome } from "./hybridController";
import { recordPrediction, recordDriftSnapshot } from "./calibrationChecker";
import { recordOverride } from "./overrideLearning";
import { recordOutcome } from "../self-improve/learningAdapter";
import { emitClinicalEvent } from "../state/clinicalEventBus";
import { getClinicalState } from "../state/clinicalStateStore";

const FEEDBACK_FILE = path.join("data", "outcome_feedback.ndjson");
const STATS_FILE    = path.join("data", "outcome_feedback_stats.json");

export interface OutcomeFeedback {
  feedbackId: string;
  caseId: string;
  complaint: string;
  symptoms: string[];
  aiDisposition: string;
  aiTopDiagnosis: string;
  aiConfidence: number;
  finalDisposition: string;
  finalDiagnosis: string;
  physicianOverride: boolean;
  overrideReason?: string;
  reward: number;
  brier_contribution: number;
  timestamp: string;
}

export interface OutcomeFeedbackStats {
  total_feedbacks: number;
  total_overrides: number;
  override_rate: number;
  avg_reward: number;
  avg_brier: number;
  accuracy_rate: number;
  by_complaint: Record<string, { total: number; correct: number; overrides: number }>;
  recalibration_runs: number;
  last_updated: string;
}

const DISPOSITION_SEVERITY: Record<string, number> = { er_now: 4, urgent_care: 3, routine: 2, home_care: 1, uncertain: 0 };

function computeReward(aiDisp: string, finalDisp: string): number {
  const aiLevel   = DISPOSITION_SEVERITY[aiDisp]   ?? 2;
  const finLevel  = DISPOSITION_SEVERITY[finalDisp] ?? 2;
  const diff = finLevel - aiLevel;
  if (diff === 0)  return 1.0;
  if (diff === 1)  return 0.5;
  if (diff === -1) return -0.5;
  if (diff >= 2)   return -2.0;
  return -1.5;
}

function brierContribution(aiConfidence: number, wasCorrect: boolean): number {
  return Math.pow(aiConfidence - (wasCorrect ? 1 : 0), 2);
}

async function loadStats(): Promise<OutcomeFeedbackStats> {
  try {
    const raw = await fs.readFile(STATS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      total_feedbacks: 0, total_overrides: 0, override_rate: 0,
      avg_reward: 0, avg_brier: 0, accuracy_rate: 0,
      by_complaint: {}, recalibration_runs: 0, last_updated: new Date().toISOString(),
    };
  }
}

async function saveStats(stats: OutcomeFeedbackStats): Promise<void> {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), "utf8");
}

export async function recordOutcomeFeedback(params: {
  caseId: string;
  complaint: string;
  symptoms: string[];
  aiDisposition: string;
  aiTopDiagnosis: string;
  aiConfidence: number;
  finalDisposition: string;
  finalDiagnosis: string;
  overrideReason?: string;
}): Promise<OutcomeFeedback> {
  await fs.mkdir("data", { recursive: true });

  const physicianOverride = params.aiDisposition !== params.finalDisposition;
  const reward = computeReward(params.aiDisposition, params.finalDisposition);
  const wasCorrect = params.aiTopDiagnosis === params.finalDiagnosis;
  const brier = brierContribution(params.aiConfidence, wasCorrect);

  const feedback: OutcomeFeedback = {
    feedbackId: `FB_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...params,
    physicianOverride,
    reward,
    brier_contribution: Math.round(brier * 1000) / 1000,
    timestamp: new Date().toISOString(),
  };

  await fs.appendFile(FEEDBACK_FILE, JSON.stringify(feedback) + "\n", "utf8");

  updateProbabilisticFromOutcome(params.symptoms, params.finalDiagnosis);

  await recordPrediction(params.caseId, params.finalDiagnosis, params.aiConfidence, wasCorrect ? 1 : 0);

  await recordOutcome(params.caseId, "hybrid_controller", params.symptoms, reward);
  await recordOutcome(params.caseId, "clinical_scoring", params.symptoms, reward);

  if (physicianOverride) {
    await recordOverride(
      params.caseId, params.complaint, params.symptoms,
      params.aiDisposition, params.aiTopDiagnosis,
      params.finalDisposition, params.finalDiagnosis,
      params.overrideReason
    );
  }

  const state = getClinicalState(params.caseId);
  if (state.events.length > 0) {
    emitClinicalEvent(params.caseId, "OUTCOME_RECORDED", {
      finalDisposition: params.finalDisposition,
      finalDiagnosis: params.finalDiagnosis,
      physicianOverride,
    });
    emitClinicalEvent(params.caseId, "REWARD_COMPUTED", { reward });
  }

  const stats = await loadStats();
  stats.total_feedbacks++;
  if (physicianOverride) stats.total_overrides++;
  stats.override_rate = Math.round((stats.total_overrides / stats.total_feedbacks) * 1000) / 1000;
  stats.avg_reward = Math.round(((stats.avg_reward * (stats.total_feedbacks - 1) + reward) / stats.total_feedbacks) * 1000) / 1000;
  stats.avg_brier  = Math.round(((stats.avg_brier  * (stats.total_feedbacks - 1) + brier)  / stats.total_feedbacks) * 1000) / 1000;

  if (!stats.by_complaint[params.complaint]) {
    stats.by_complaint[params.complaint] = { total: 0, correct: 0, overrides: 0 };
  }
  stats.by_complaint[params.complaint].total++;
  if (wasCorrect) stats.by_complaint[params.complaint].correct++;
  if (physicianOverride) stats.by_complaint[params.complaint].overrides++;
  stats.accuracy_rate = Math.round(
    (Object.values(stats.by_complaint).reduce((s, v) => s + v.correct, 0) /
     Math.max(1, Object.values(stats.by_complaint).reduce((s, v) => s + v.total, 0))) * 1000
  ) / 1000;
  stats.recalibration_runs++;
  stats.last_updated = new Date().toISOString();

  await saveStats(stats);

  await recordDriftSnapshot({
    total_evaluations: stats.total_feedbacks,
    er_count:          0,
    urgent_care_count: 0,
    home_care_count:   0,
    override_count:    stats.total_overrides,
    dangerous_miss_count: 0,
    er_rate:           0,
    dangerous_miss_rate: 0,
    avg_confidence:    params.aiConfidence,
  });

  return feedback;
}

export async function getOutcomeFeedbackStats(): Promise<OutcomeFeedbackStats> {
  return loadStats();
}

export async function getRecentFeedbacks(limit = 20): Promise<OutcomeFeedback[]> {
  try {
    const raw = await fs.readFile(FEEDBACK_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean)
      .map(l => JSON.parse(l))
      .slice(-limit)
      .reverse();
  } catch { return []; }
}
