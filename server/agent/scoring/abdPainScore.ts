import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface AbdPainScoringResult {
  abd_pain_score: number;
  gastroenteritis_score: number;
  appendicitis_score: number;
  cholecystitis_score: number;
  pancreatitis_score: number;
  gi_bleed_score: number;
  aaa_score: number;
  diverticulitis_score: number;
  renal_colic_score: number;
  ectopic_score: number;
  mesenteric_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeAbdPainScore(state: CaseState): AbdPainScoringResult {
  const a = state.answers;

  const fever = tri(a["Q_AP_FEVER"]);
  const nausea = tri(a["Q_AP_NAUSEA"]);
  const vomiting = tri(a["Q_AP_VOMITING"]);
  const diarrhea = tri(a["Q_AP_DIARRHEA"]);
  const constipation = tri(a["Q_AP_CONSTIPATION"]);
  const bloodyStool = tri(a["Q_AP_BLOODY_STOOL"]);
  const hematemesis = tri(a["Q_AP_HEMATEMESIS"]);
  const rlqPain = tri(a["Q_AP_RLQ"]);
  const ruqPain = tri(a["Q_AP_RUQ"]);
  const llqPain = tri(a["Q_AP_LLQ"]);
  const epigastric = tri(a["Q_AP_EPIGASTRIC"]);
  const fattyTrigger = tri(a["Q_AP_FATTY_TRIGGER"]);
  const backRadiation = tri(a["Q_AP_BACK_RADIATION"]);
  const missedPeriod = tri(a["Q_AP_MISSED_PERIOD"]);
  const flankToGroin = tri(a["Q_AP_FLANK_GROIN"]);
  const hematuria = tri(a["Q_AP_HEMATURIA"]);
  const hypotension = tri(a["Q_AP_HYPOTENSION"]);
  const postprandial = tri(a["Q_AP_POSTPRANDIAL"]);
  const afib = tri(a["Q_AP_AFIB"]);

  const used = [
    "Q_AP_FEVER", "Q_AP_NAUSEA", "Q_AP_VOMITING", "Q_AP_DIARRHEA",
    "Q_AP_CONSTIPATION", "Q_AP_BLOODY_STOOL", "Q_AP_HEMATEMESIS",
    "Q_AP_RLQ", "Q_AP_RUQ", "Q_AP_LLQ", "Q_AP_EPIGASTRIC",
    "Q_AP_FATTY_TRIGGER", "Q_AP_BACK_RADIATION", "Q_AP_MISSED_PERIOD",
    "Q_AP_FLANK_GROIN", "Q_AP_HEMATURIA", "Q_AP_HYPOTENSION",
    "Q_AP_POSTPRANDIAL", "Q_AP_AFIB",
  ];

  let gastroenteritis = 0;
  if (diarrhea === "yes") gastroenteritis += 3;
  if (nausea === "yes") gastroenteritis += 1;
  if (vomiting === "yes") gastroenteritis += 1;
  if (fever === "no") gastroenteritis += 1;
  if (bloodyStool === "no") gastroenteritis += 1;

  let appendicitis = 0;
  if (rlqPain === "yes") appendicitis += 4;
  if (fever === "yes") appendicitis += 2;
  if (nausea === "yes") appendicitis += 1;
  if (vomiting === "yes") appendicitis += 1;

  let cholecystitis = 0;
  if (ruqPain === "yes") cholecystitis += 3;
  if (fattyTrigger === "yes") cholecystitis += 2;
  if (fever === "yes") cholecystitis += 2;
  if (nausea === "yes") cholecystitis += 1;

  let pancreatitis = 0;
  if (epigastric === "yes") pancreatitis += 3;
  if (backRadiation === "yes") pancreatitis += 3;
  if (vomiting === "yes") pancreatitis += 2;

  let giBleed = 0;
  if (bloodyStool === "yes") giBleed += 4;
  if (hematemesis === "yes") giBleed += 4;
  if (hypotension === "yes") giBleed += 2;

  let aaa = 0;
  if (hypotension === "yes") aaa += 3;
  if (backRadiation === "yes") aaa += 2;
  if (epigastric === "yes") aaa += 1;

  let diverticulitis = 0;
  if (llqPain === "yes") diverticulitis += 3;
  if (fever === "yes") diverticulitis += 2;
  if (constipation === "yes") diverticulitis += 1;

  let renalColic = 0;
  if (flankToGroin === "yes") renalColic += 4;
  if (hematuria === "yes") renalColic += 3;
  if (nausea === "yes") renalColic += 1;

  let ectopic = 0;
  if (missedPeriod === "yes") ectopic += 4;
  if (rlqPain === "yes" || llqPain === "yes") ectopic += 2;
  if (hypotension === "yes") ectopic += 2;

  let mesenteric = 0;
  if (afib === "yes") mesenteric += 3;
  if (postprandial === "yes") mesenteric += 3;
  if (hypotension === "yes") mesenteric += 2;

  const allScores: Record<string, number> = {
    CL_GI_GASTROENTERITIS: gastroenteritis,
    CL_GI_APPENDICITIS: appendicitis,
    CL_GI_CHOLECYSTITIS: cholecystitis,
    CL_GI_PANCREATITIS: pancreatitis,
    CL_GI_GI_BLEED: giBleed,
    CL_GI_AAA: aaa,
    CL_GI_DIVERTICULITIS: diverticulitis,
    CL_GI_RENAL_COLIC: renalColic,
    CL_GI_ECTOPIC: ectopic,
    CL_GI_MESENTERIC: mesenteric,
  };

  let cluster = "UNCLASSIFIED";
  let maxScore = 0;
  for (const [cid, pts] of Object.entries(allScores)) {
    if (pts > maxScore) {
      maxScore = pts;
      cluster = cid;
    }
  }

  const composite = Math.max(
    gastroenteritis, appendicitis, cholecystitis, pancreatitis,
    giBleed, aaa, diverticulitis, renalColic, ectopic, mesenteric
  );

  return {
    abd_pain_score: composite,
    gastroenteritis_score: gastroenteritis,
    appendicitis_score: appendicitis,
    cholecystitis_score: cholecystitis,
    pancreatitis_score: pancreatitis,
    gi_bleed_score: giBleed,
    aaa_score: aaa,
    diverticulitis_score: diverticulitis,
    renal_colic_score: renalColic,
    ectopic_score: ectopic,
    mesenteric_score: mesenteric,
    inputsUsed: used,
    cluster,
  };
}
