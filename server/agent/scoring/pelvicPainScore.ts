import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface PelvicPainScoringResult {
  pelvic_pain_score: number;
  ectopic_score: number;
  pp_torsion_score: number;
  pid_score: number;
  ruptured_cyst_score: number;
  endometriosis_score: number;
  fibroids_score: number;
  uti_mimic_score: number;
  pp_appendicitis_score: number;
  pp_sepsis_score: number;
  benign_pp_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computePelvicPainScore(state: CaseState): PelvicPainScoringResult {
  const a = state.answers;

  const pelvicPain = tri(a["Q_PP_PELVIC_PAIN"]);
  const pregnant = tri(a["Q_PP_PREGNANT"]);
  const missedPeriod = tri(a["Q_PP_MISSED_PERIOD"]);
  const vaginalBleeding = tri(a["Q_PP_VAGINAL_BLEEDING"]);
  const dizziness = tri(a["Q_PP_DIZZINESS"]);
  const suddenOnset = tri(a["Q_PP_SUDDEN_ONSET"]);
  const severeUnilateral = tri(a["Q_PP_SEVERE_UNILATERAL"]);
  const nausea = tri(a["Q_PP_NAUSEA"]);
  const vomiting = tri(a["Q_PP_VOMITING"]);
  const fever = tri(a["Q_PP_FEVER"]);
  const discharge = tri(a["Q_PP_DISCHARGE"]);
  const stiRisk = tri(a["Q_PP_STI_RISK"]);
  const afterActivity = tri(a["Q_PP_AFTER_ACTIVITY"]);
  const resolving = tri(a["Q_PP_RESOLVING"]);
  const cyclical = tri(a["Q_PP_CYCLICAL"]);
  const mensesRelated = tri(a["Q_PP_MENSES_RELATED"]);
  const heavyBleeding = tri(a["Q_PP_HEAVY_BLEEDING"]);
  const pelvicPressure = tri(a["Q_PP_PELVIC_PRESSURE"]);
  const ppDysuria = tri(a["Q_PP_DYSURIA"]);
  const ppFrequency = tri(a["Q_PP_FREQUENCY"]);
  const rlqPain = tri(a["Q_PP_RLQ_PAIN"]);
  const anorexia = tri(a["Q_PP_ANOREXIA"]);
  const confusion = tri(a["Q_PP_CONFUSION"]);
  const hypotension = tri(a["Q_PP_HYPOTENSION"]);

  const used = [
    "Q_PP_PELVIC_PAIN", "Q_PP_PREGNANT", "Q_PP_MISSED_PERIOD", "Q_PP_VAGINAL_BLEEDING",
    "Q_PP_DIZZINESS", "Q_PP_SUDDEN_ONSET", "Q_PP_SEVERE_UNILATERAL", "Q_PP_NAUSEA",
    "Q_PP_VOMITING", "Q_PP_FEVER", "Q_PP_DISCHARGE", "Q_PP_STI_RISK",
    "Q_PP_AFTER_ACTIVITY", "Q_PP_RESOLVING", "Q_PP_CYCLICAL", "Q_PP_MENSES_RELATED",
    "Q_PP_HEAVY_BLEEDING", "Q_PP_PELVIC_PRESSURE", "Q_PP_DYSURIA", "Q_PP_FREQUENCY",
    "Q_PP_RLQ_PAIN", "Q_PP_ANOREXIA", "Q_PP_CONFUSION", "Q_PP_HYPOTENSION",
  ];

  let ectopic = 0;
  if (pregnant === "yes") ectopic += 4;
  if (missedPeriod === "yes") ectopic += 2;
  if (vaginalBleeding === "yes") ectopic += 3;
  if (dizziness === "yes") ectopic += 2;
  if (hypotension === "yes") ectopic += 2;

  let ppTorsion = 0;
  if (suddenOnset === "yes") ppTorsion += 4;
  if (severeUnilateral === "yes") ppTorsion += 4;
  if (nausea === "yes") ppTorsion += 2;
  if (vomiting === "yes") ppTorsion += 1;

  let pid = 0;
  if (fever === "yes") pid += 3;
  if (discharge === "yes") pid += 3;
  if (stiRisk === "yes") pid += 2;
  if (pelvicPain === "yes") pid += 1;

  let rupturedCyst = 0;
  if (suddenOnset === "yes") rupturedCyst += 3;
  if (afterActivity === "yes") rupturedCyst += 3;
  if (resolving === "yes") rupturedCyst += 2;
  if (fever === "no") rupturedCyst += 1;

  let endometriosis = 0;
  if (cyclical === "yes") endometriosis += 4;
  if (mensesRelated === "yes") endometriosis += 3;
  if (pelvicPain === "yes") endometriosis += 1;

  let fibroids = 0;
  if (heavyBleeding === "yes") fibroids += 4;
  if (pelvicPressure === "yes") fibroids += 3;
  if (pelvicPain === "yes") fibroids += 1;

  let utiMimic = 0;
  if (ppDysuria === "yes") utiMimic += 4;
  if (ppFrequency === "yes") utiMimic += 3;
  if (fever === "yes") utiMimic += 1;

  let ppAppend = 0;
  if (rlqPain === "yes") ppAppend += 4;
  if (fever === "yes") ppAppend += 3;
  if (anorexia === "yes") ppAppend += 2;
  if (nausea === "yes") ppAppend += 1;

  let ppSepsis = 0;
  if (fever === "yes") ppSepsis += 3;
  if (confusion === "yes") ppSepsis += 4;
  if (hypotension === "yes") ppSepsis += 4;
  if (vomiting === "yes") ppSepsis += 1;
  if (dizziness === "yes") ppSepsis += 1;

  let benignPp = 0;
  if (pelvicPain === "yes") benignPp += 2;
  if (fever === "no") benignPp += 2;
  if (pregnant === "no") benignPp += 1;
  if (suddenOnset === "no") benignPp += 1;
  if (severeUnilateral === "no") benignPp += 1;

  const allScores: Record<string, number> = {
    CL_GYN_ECTOPIC: ectopic,
    CL_GYN_TORSION: ppTorsion,
    CL_GYN_PID: pid,
    CL_GYN_RUPTURED_CYST: rupturedCyst,
    CL_GYN_ENDOMETRIOSIS: endometriosis,
    CL_GYN_FIBROIDS: fibroids,
    CL_GYN_UTI_MIMIC: utiMimic,
    CL_GYN_APPENDICITIS: ppAppend,
    CL_GYN_SEPSIS: ppSepsis,
    CL_GYN_BENIGN: benignPp,
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
    ectopic, ppTorsion, pid, rupturedCyst, endometriosis,
    fibroids, utiMimic, ppAppend, ppSepsis, benignPp
  );

  return {
    pelvic_pain_score: composite,
    ectopic_score: ectopic,
    pp_torsion_score: ppTorsion,
    pid_score: pid,
    ruptured_cyst_score: rupturedCyst,
    endometriosis_score: endometriosis,
    fibroids_score: fibroids,
    uti_mimic_score: utiMimic,
    pp_appendicitis_score: ppAppend,
    pp_sepsis_score: ppSepsis,
    benign_pp_score: benignPp,
    inputsUsed: used,
    cluster,
  };
}
