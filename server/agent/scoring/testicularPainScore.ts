import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface TesticularPainScoringResult {
  testicular_pain_score: number;
  torsion_score: number;
  epid_sti_score: number;
  epid_enteric_score: number;
  fournier_score: number;
  hernia_score: number;
  prostatitis_score: number;
  trauma_score: number;
  varicocele_score: number;
  stone_ref_score: number;
  benign_tp_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeTesticularPainScore(state: CaseState): TesticularPainScoringResult {
  const a = state.answers;

  const suddenOnset = tri(a["Q_TP_SUDDEN_ONSET"]);
  const severePain = tri(a["Q_TP_SEVERE_PAIN"]);
  const unilateral = tri(a["Q_TP_UNILATERAL"]);
  const highRiding = tri(a["Q_TP_HIGH_RIDING"]);
  const nausea = tri(a["Q_TP_NAUSEA"]);
  const vomiting = tri(a["Q_TP_VOMITING"]);
  const dysuria = tri(a["Q_TP_DYSURIA"]);
  const discharge = tri(a["Q_TP_DISCHARGE"]);
  const newPartner = tri(a["Q_TP_NEW_PARTNER"]);
  const olderAge = tri(a["Q_TP_OLDER_AGE"]);
  const urinarySx = tri(a["Q_TP_URINARY_SX"]);
  const perinealPain = tri(a["Q_TP_PERINEAL_PAIN"]);
  const fever = tri(a["Q_TP_FEVER"]);
  const skinChanges = tri(a["Q_TP_SKIN_CHANGES"]);
  const crepitus = tri(a["Q_TP_CREPITUS"]);
  const groinBulge = tri(a["Q_TP_GROIN_BULGE"]);
  const obstructionSx = tri(a["Q_TP_OBSTRUCTION_SX"]);
  const retention = tri(a["Q_TP_RETENTION"]);
  const trauma = tri(a["Q_TP_TRAUMA"]);
  const swelling = tri(a["Q_TP_SWELLING"]);
  const chronic = tri(a["Q_TP_CHRONIC"]);
  const worseStanding = tri(a["Q_TP_WORSE_STANDING"]);
  const flankGroin = tri(a["Q_TP_FLANK_GROIN"]);
  const hematuria = tri(a["Q_TP_HEMATURIA"]);

  const used = [
    "Q_TP_SUDDEN_ONSET", "Q_TP_SEVERE_PAIN", "Q_TP_UNILATERAL", "Q_TP_HIGH_RIDING",
    "Q_TP_NAUSEA", "Q_TP_VOMITING", "Q_TP_DYSURIA", "Q_TP_DISCHARGE",
    "Q_TP_NEW_PARTNER", "Q_TP_OLDER_AGE", "Q_TP_URINARY_SX", "Q_TP_PERINEAL_PAIN",
    "Q_TP_FEVER", "Q_TP_SKIN_CHANGES", "Q_TP_CREPITUS", "Q_TP_GROIN_BULGE",
    "Q_TP_OBSTRUCTION_SX", "Q_TP_RETENTION", "Q_TP_TRAUMA", "Q_TP_SWELLING",
    "Q_TP_CHRONIC", "Q_TP_WORSE_STANDING", "Q_TP_FLANK_GROIN", "Q_TP_HEMATURIA",
  ];

  let torsion = 0;
  if (suddenOnset === "yes") torsion += 4;
  if (severePain === "yes") torsion += 3;
  if (unilateral === "yes") torsion += 2;
  if (highRiding === "yes") torsion += 3;
  if (nausea === "yes") torsion += 1;
  if (vomiting === "yes") torsion += 1;

  let epidSti = 0;
  if (dysuria === "yes") epidSti += 2;
  if (discharge === "yes") epidSti += 3;
  if (newPartner === "yes") epidSti += 3;
  if (severePain === "no") epidSti += 1;

  let epidEnteric = 0;
  if (olderAge === "yes") epidEnteric += 3;
  if (urinarySx === "yes") epidEnteric += 3;
  if (dysuria === "yes") epidEnteric += 2;
  if (newPartner === "no") epidEnteric += 1;

  let fournier = 0;
  if (fever === "yes") fournier += 3;
  if (skinChanges === "yes") fournier += 4;
  if (crepitus === "yes") fournier += 4;
  if (severePain === "yes") fournier += 1;

  let hernia = 0;
  if (groinBulge === "yes") hernia += 4;
  if (obstructionSx === "yes") hernia += 3;
  if (vomiting === "yes") hernia += 2;
  if (severePain === "yes") hernia += 1;

  let prostatitis = 0;
  if (fever === "yes") prostatitis += 3;
  if (perinealPain === "yes") prostatitis += 3;
  if (retention === "yes") prostatitis += 2;
  if (dysuria === "yes") prostatitis += 1;
  if (urinarySx === "yes") prostatitis += 1;

  let traumaS = 0;
  if (trauma === "yes") traumaS += 4;
  if (swelling === "yes") traumaS += 3;
  if (severePain === "yes") traumaS += 2;

  let varicocele = 0;
  if (chronic === "yes") varicocele += 3;
  if (worseStanding === "yes") varicocele += 3;
  if (fever === "no") varicocele += 1;
  if (severePain === "no") varicocele += 1;

  let stoneRef = 0;
  if (flankGroin === "yes") stoneRef += 4;
  if (hematuria === "yes") stoneRef += 3;
  if (nausea === "yes") stoneRef += 1;

  let benignTp = 0;
  if (chronic === "yes") benignTp += 2;
  if (fever === "no") benignTp += 2;
  if (severePain === "no") benignTp += 2;
  if (suddenOnset === "no") benignTp += 1;

  const allScores: Record<string, number> = {
    CL_GU_TORSION: torsion,
    CL_GU_EPID_STI: epidSti,
    CL_GU_EPID_ENTERIC: epidEnteric,
    CL_GU_FOURNIER: fournier,
    CL_GU_HERNIA: hernia,
    CL_GU_PROSTATITIS: prostatitis,
    CL_GU_TRAUMA: traumaS,
    CL_GU_VARICOCELE: varicocele,
    CL_GU_STONE_REF: stoneRef,
    CL_GU_BENIGN_TP: benignTp,
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
    torsion, epidSti, epidEnteric, fournier, hernia,
    prostatitis, traumaS, varicocele, stoneRef, benignTp
  );

  return {
    testicular_pain_score: composite,
    torsion_score: torsion,
    epid_sti_score: epidSti,
    epid_enteric_score: epidEnteric,
    fournier_score: fournier,
    hernia_score: hernia,
    prostatitis_score: prostatitis,
    trauma_score: traumaS,
    varicocele_score: varicocele,
    stone_ref_score: stoneRef,
    benign_tp_score: benignTp,
    inputsUsed: used,
    cluster,
  };
}
