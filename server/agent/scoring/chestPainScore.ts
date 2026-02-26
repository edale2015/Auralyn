import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface ChestPainScoringResult {
  chest_pain_score: number;
  acs_score: number;
  pe_score: number;
  dissection_score: number;
  pericarditis_score: number;
  pneumonia_score: number;
  gerd_score: number;
  msk_score: number;
  anxiety_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeChestPainScore(state: CaseState): ChestPainScoringResult {
  const a = state.answers;

  const exertional = tri(a["Q_CP_EXERTIONAL"]);
  const radiates = tri(a["Q_CP_RADIATES"]);
  const diaphoresis = tri(a["Q_CP_DIAPHORESIS"]);
  const sob = tri(a["Q_CP_SOB"]);
  const syncope = tri(a["Q_CP_SYNCOPE"]);
  const palpitations = tri(a["Q_CP_PALPITATIONS"]);
  const reproducible = tri(a["Q_CP_REPRODUCIBLE"]);
  const pleuritic = tri(a["Q_CP_PLEURITIC"]);
  const calfSwelling = tri(a["Q_CP_CALF_SWELL"]);
  const immobility = tri(a["Q_CP_IMMOBILITY"]);
  const tearing = tri(a["Q_CP_TEARING"]);
  const neuroSymptoms = tri(a["Q_CP_NEURO"]);
  const worseFlat = tri(a["Q_CP_WORSE_FLAT"]);
  const recentViral = tri(a["Q_CP_RECENT_VIRAL"]);
  const fever = tri(a["Q_CP_FEVER"]);
  const cough = tri(a["Q_CP_COUGH"]);
  const antacidRelief = tri(a["Q_CP_ANTACID_RELIEF"]);
  const burning = tri(a["Q_CP_BURNING"]);
  const htnSymptoms = tri(a["Q_CP_HTN_SYMPTOMS"]);
  const stressTrigger = tri(a["Q_CP_STRESS_TRIGGER"]);
  const tingling = tri(a["Q_CP_TINGLING"]);

  const used = [
    "Q_CP_EXERTIONAL", "Q_CP_RADIATES", "Q_CP_DIAPHORESIS", "Q_CP_SOB",
    "Q_CP_SYNCOPE", "Q_CP_PALPITATIONS", "Q_CP_REPRODUCIBLE", "Q_CP_PLEURITIC",
    "Q_CP_CALF_SWELL", "Q_CP_IMMOBILITY", "Q_CP_TEARING", "Q_CP_NEURO",
    "Q_CP_WORSE_FLAT", "Q_CP_RECENT_VIRAL", "Q_CP_FEVER", "Q_CP_COUGH",
    "Q_CP_ANTACID_RELIEF", "Q_CP_BURNING", "Q_CP_HTN_SYMPTOMS",
    "Q_CP_STRESS_TRIGGER", "Q_CP_TINGLING",
  ];

  let acs = 0;
  if (exertional === "yes") acs += 3;
  if (radiates === "yes") acs += 2;
  if (diaphoresis === "yes") acs += 3;
  if (sob === "yes") acs += 1;
  if (syncope === "yes") acs += 2;
  if (reproducible === "yes") acs -= 2;
  if (acs < 0) acs = 0;

  let pe = 0;
  if (pleuritic === "yes") pe += 2;
  if (sob === "yes") pe += 3;
  if (calfSwelling === "yes") pe += 3;
  if (immobility === "yes") pe += 2;

  let dissection = 0;
  if (tearing === "yes") dissection += 4;
  if (neuroSymptoms === "yes") dissection += 3;
  if (sob === "yes") dissection += 1;

  let pericarditis = 0;
  if (worseFlat === "yes") pericarditis += 3;
  if (recentViral === "yes") pericarditis += 2;
  if (fever === "yes") pericarditis += 1;
  if (pleuritic === "yes") pericarditis += 1;

  let pneumonia = 0;
  if (fever === "yes") pneumonia += 3;
  if (cough === "yes") pneumonia += 2;
  if (pleuritic === "yes") pneumonia += 1;
  if (sob === "yes") pneumonia += 1;

  let gerd = 0;
  if (burning === "yes") gerd += 3;
  if (antacidRelief === "yes") gerd += 3;
  if (exertional === "no") gerd += 1;
  if (sob === "no") gerd += 1;

  let msk = 0;
  if (reproducible === "yes") msk += 4;
  if (exertional === "no") msk += 1;
  if (sob === "no") msk += 1;
  if (diaphoresis === "no") msk += 1;
  if (syncope === "no") msk += 1;

  let anxiety = 0;
  if (stressTrigger === "yes") anxiety += 3;
  if (tingling === "yes") anxiety += 2;
  if (palpitations === "yes") anxiety += 1;
  if (exertional === "no") anxiety += 1;
  if (sob === "no") anxiety += 1;

  const allScores: Record<string, number> = {
    CL_CARD_ACS: acs,
    CL_CARD_PE: pe,
    CL_CARD_DISSECTION: dissection,
    CL_CARD_PERICARDITIS: pericarditis,
    CL_CARD_PNEUMONIA: pneumonia,
    CL_CARD_GERD: gerd,
    CL_CARD_MSK: msk,
    CL_CARD_ANXIETY: anxiety,
  };

  let cluster = "UNCLASSIFIED";
  let maxScore = 0;
  for (const [cid, pts] of Object.entries(allScores)) {
    if (pts > maxScore) {
      maxScore = pts;
      cluster = cid;
    }
  }

  const composite = Math.max(acs, pe, dissection, pericarditis, pneumonia, gerd, msk, anxiety);

  return {
    chest_pain_score: composite,
    acs_score: acs,
    pe_score: pe,
    dissection_score: dissection,
    pericarditis_score: pericarditis,
    pneumonia_score: pneumonia,
    gerd_score: gerd,
    msk_score: msk,
    anxiety_score: anxiety,
    inputsUsed: used,
    cluster,
  };
}
