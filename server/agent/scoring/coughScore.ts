import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface CoughScoringResult {
  cough_score: number;
  pe_score: number;
  pneumonia_score: number;
  asthma_exac_score: number;
  copd_exac_score: number;
  viral_uri_score: number;
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

  let pneumonia = 0;
  if (fever === "yes") pneumonia += 3;
  if (sob === "yes") pneumonia += 2;
  if (dur >= 3 && dur <= 14) pneumonia += 2;
  if (o2low === "yes") pneumonia += 1;

  let asthmaExac = 0;
  if (wheeze === "yes") asthmaExac += 3;
  if (asthma === "yes") asthmaExac += 3;
  if (sob === "yes") asthmaExac += 1;
  if (fever === "no") asthmaExac += 1;

  let copdExac = 0;
  if (copd === "yes") copdExac += 4;
  if (sob === "yes") copdExac += 2;
  if (o2low === "yes") copdExac += 2;
  if (wheeze === "yes") copdExac += 1;

  let viralUri = 0;
  if (fever === "no") viralUri += 2;
  if (sob === "no") viralUri += 2;
  if (cp === "no") viralUri += 1;
  if (hemop === "no") viralUri += 1;
  if (o2low === "no") viralUri += 1;
  if (dur > 0 && dur <= 10) viralUri += 1;
  if (wheeze === "yes") viralUri -= 3;
  if (asthma === "yes") viralUri -= 2;
  if (copd === "yes") viralUri -= 2;
  if (viralUri < 0) viralUri = 0;

  let infection = 0;
  if (fever === "yes") infection += 3;
  if (dur >= 2 && dur <= 4) infection += 2;
  if (sob === "yes") infection += 1;

  const allScores: Record<string, number> = {
    CL_PULM_PE_OVERLAP: pe,
    CL_PULM_PNEUMONIA: pneumonia,
    CL_PULM_ASTHMA_EXAC: asthmaExac,
    CL_PULM_COPD_EXAC: copdExac,
    CL_PULM_VIRAL_URI: viralUri,
    CL_PULM_INFECTION: infection,
  };

  const noRedFlagInputs = cp !== "yes" && sob !== "yes" && hemop !== "yes" && o2low !== "yes";

  let cluster = "UNCLASSIFIED";
  let maxScore = 0;

  if (noRedFlagInputs && fever !== "yes" && asthma !== "yes" && copd !== "yes" && wheeze !== "yes") {
    cluster = "CL_PULM_VIRAL_URI";
    maxScore = viralUri;
  } else {
    for (const [cid, pts] of Object.entries(allScores)) {
      if (cid === "CL_PULM_VIRAL_URI") continue;
      if (pts > maxScore) {
        maxScore = pts;
        cluster = cid;
      }
    }
  }

  const composite = Math.max(pe, pneumonia, asthmaExac, copdExac, viralUri, infection);

  return {
    cough_score: composite,
    pe_score: pe,
    pneumonia_score: pneumonia,
    asthma_exac_score: asthmaExac,
    copd_exac_score: copdExac,
    viral_uri_score: viralUri,
    infection_score: infection,
    inputsUsed: used,
    cluster,
  };
}
