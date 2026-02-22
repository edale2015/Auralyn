import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface EaracheScoringResult {
  earache_score: number;
  oe_score: number;
  aom_score: number;
  tmj_score: number;
  etd_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeEaracheScore(state: CaseState): EaracheScoringResult {
  const a = state.answers;

  const fever = tri(a["Q_EA_FEVER"]);
  const tragus = tri(a["Q_EA_TRAGUS_TENDER"]);
  const swim = tri(a["Q_EA_SWIM"]);
  const qtip = tri(a["Q_EA_QTIP"]);
  const uri = tri(a["Q_EA_URI"]);
  const hearingLoss = tri(a["Q_EA_HEARING_LOSS"]);
  const drainage = tri(a["Q_EA_DRAINAGE"]);
  const jawPain = tri(a["Q_EA_JAW_PAIN"]);
  const chewingWorse = tri(a["Q_EA_CHEWING_WORSE"]);
  const blocked = tri(a["Q_EA_BLOCKED_EAR"]);
  const mastoid = tri(a["Q_EA_MASTOID_PAIN"]);
  const severePain = tri(a["Q_EA_SEVERE_PAIN"]);

  const used = [
    "Q_EA_FEVER", "Q_EA_TRAGUS_TENDER", "Q_EA_SWIM", "Q_EA_QTIP",
    "Q_EA_URI", "Q_EA_HEARING_LOSS", "Q_EA_DRAINAGE", "Q_EA_JAW_PAIN",
    "Q_EA_CHEWING_WORSE", "Q_EA_BLOCKED_EAR", "Q_EA_MASTOID_PAIN", "Q_EA_SEVERE_PAIN",
  ];

  let oe = 0;
  if (tragus === "yes") oe += 3;
  if (swim === "yes") oe += 2;
  if (qtip === "yes") oe += 2;
  if (drainage === "yes") oe += 1;
  if (fever === "no") oe += 1;

  let aom = 0;
  if (fever === "yes") aom += 2;
  if (uri === "yes") aom += 2;
  if (hearingLoss === "yes") aom += 2;
  if (tragus === "no") aom += 1;
  if (blocked === "yes") aom += 1;

  let tmj = 0;
  if (jawPain === "yes") tmj += 3;
  if (chewingWorse === "yes") tmj += 3;
  if (fever === "no") tmj += 1;
  if (tragus === "no") tmj += 1;

  let etd = 0;
  if (blocked === "yes") etd += 3;
  if (hearingLoss === "yes") etd += 1;
  if (fever === "no") etd += 1;
  if (tragus === "no") etd += 1;

  const scores = { oe, aom, tmj, etd };
  const maxScore = Math.max(oe, aom, tmj, etd);
  let cluster = "UNCLASSIFIED";
  if (maxScore > 0) {
    if (oe === maxScore) cluster = "CL_EA_OE";
    else if (aom === maxScore) cluster = "CL_EA_AOM";
    else if (tmj === maxScore) cluster = "CL_EA_TMJ";
    else if (etd === maxScore) cluster = "CL_EA_ETD";
  }

  const composite = Math.max(oe, aom, tmj, etd);

  return {
    earache_score: composite,
    oe_score: oe,
    aom_score: aom,
    tmj_score: tmj,
    etd_score: etd,
    inputsUsed: used,
    cluster,
  };
}
