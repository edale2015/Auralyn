import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface CoughScoringResult {
  cough_score: number;
  pe_score: number;
  asthma_copd_score: number;
  infection_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeCoughScore(state: CaseState): CoughScoringResult {
  const a = state.answers;

  const cp = tri(a["Q_COUGH_CP"]);
  const sob = tri(a["Q_COUGH_SOB"]);
  const legSwell = tri(a["Q_COUGH_LEG_SWELL"]);
  const recentSx = tri(a["Q_COUGH_RECENT_SX"]);
  const o2low = tri(a["Q_COUGH_O2LOW"]);
  const hemop = tri(a["Q_COUGH_HEMOP"]);
  const fever = tri(a["Q_COUGH_FEVER"]);
  const wheeze = tri(a["Q_COUGH_WHEEZE"]);
  const asthma = tri(a["Q_COUGH_ASTHMA"]);
  const copd = tri(a["Q_COUGH_COPD"]);
  const dur = Number(a["Q_COUGH_DUR"]) || 0;

  const used = [
    "Q_COUGH_CP", "Q_COUGH_SOB", "Q_COUGH_LEG_SWELL", "Q_COUGH_RECENT_SX",
    "Q_COUGH_O2LOW", "Q_COUGH_HEMOP", "Q_COUGH_FEVER", "Q_COUGH_WHEEZE",
    "Q_COUGH_ASTHMA", "Q_COUGH_COPD", "Q_COUGH_DUR",
  ];

  let pe = 0;
  if (cp === "yes") pe += 3;
  if (sob === "yes") pe += 2;
  if (legSwell === "yes") pe += 3;
  if (recentSx === "yes") pe += 2;
  if (hemop === "yes") pe += 2;
  if (o2low === "yes") pe += 1;

  let asthmaCopd = 0;
  if (wheeze === "yes") asthmaCopd += 3;
  if (asthma === "yes") asthmaCopd += 3;
  if (copd === "yes") asthmaCopd += 3;
  if (sob === "yes") asthmaCopd += 1;
  if (fever === "no") asthmaCopd += 1;

  let infection = 0;
  if (fever === "yes") infection += 3;
  if (dur >= 2 && dur <= 4) infection += 2;
  if (sob === "yes") infection += 1;

  const scores = { pe, asthmaCopd, infection };
  const maxScore = Math.max(pe, asthmaCopd, infection);
  let cluster = "UNCLASSIFIED";
  if (maxScore > 0) {
    if (pe === maxScore) cluster = "CL_PULM_PE_OVERLAP";
    else if (asthmaCopd === maxScore) cluster = "CL_PULM_ASTHMA_COPD";
    else if (infection === maxScore) cluster = "CL_PULM_INFECTION";
  }

  const composite = maxScore;

  return {
    cough_score: composite,
    pe_score: pe,
    asthma_copd_score: asthmaCopd,
    infection_score: infection,
    inputsUsed: used,
    cluster,
  };
}
