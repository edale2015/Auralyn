import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface UtiScoringResult {
  uti_score: number;
  cystitis_score: number;
  pyelo_score: number;
  urosepsis_score: number;
  pregnancy_uti_score: number;
  male_uti_score: number;
  immuno_score: number;
  hematuria_score: number;
  renal_stone_score: number;
  sti_mimic_score: number;
  no_uti_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeUtiScore(state: CaseState): UtiScoringResult {
  const a = state.answers;

  const dysuria = tri(a["Q_UTI_DYSURIA"]);
  const frequency = tri(a["Q_UTI_FREQUENCY"]);
  const urgency = tri(a["Q_UTI_URGENCY"]);
  const flankPain = tri(a["Q_UTI_FLANK_PAIN"]);
  const fever = tri(a["Q_UTI_FEVER"]);
  const chills = tri(a["Q_UTI_CHILLS"]);
  const nausea = tri(a["Q_UTI_NAUSEA"]);
  const vomiting = tri(a["Q_UTI_VOMITING"]);
  const confusion = tri(a["Q_UTI_CONFUSION"]);
  const weakness = tri(a["Q_UTI_WEAKNESS"]);
  const pregnant = tri(a["Q_UTI_PREGNANT"]);
  const male = tri(a["Q_UTI_MALE"]);
  const immunocompromised = tri(a["Q_UTI_IMMUNOCOMPROMISED"]);
  const grossHematuria = tri(a["Q_UTI_GROSS_HEMATURIA"]);
  const clots = tri(a["Q_UTI_CLOTS"]);
  const retention = tri(a["Q_UTI_RETENTION"]);
  const colickyPain = tri(a["Q_UTI_COLICKY_PAIN"]);
  const groinRadiation = tri(a["Q_UTI_GROIN_RADIATION"]);
  const discharge = tri(a["Q_UTI_DISCHARGE"]);
  const newPartner = tri(a["Q_UTI_NEW_PARTNER"]);
  const genitalLesions = tri(a["Q_UTI_GENITAL_LESIONS"]);

  const used = [
    "Q_UTI_DYSURIA", "Q_UTI_FREQUENCY", "Q_UTI_URGENCY", "Q_UTI_FLANK_PAIN",
    "Q_UTI_FEVER", "Q_UTI_CHILLS", "Q_UTI_NAUSEA", "Q_UTI_VOMITING",
    "Q_UTI_CONFUSION", "Q_UTI_WEAKNESS", "Q_UTI_PREGNANT", "Q_UTI_MALE",
    "Q_UTI_IMMUNOCOMPROMISED", "Q_UTI_GROSS_HEMATURIA", "Q_UTI_CLOTS",
    "Q_UTI_RETENTION", "Q_UTI_COLICKY_PAIN", "Q_UTI_GROIN_RADIATION",
    "Q_UTI_DISCHARGE", "Q_UTI_NEW_PARTNER", "Q_UTI_GENITAL_LESIONS",
  ];

  let cystitis = 0;
  if (dysuria === "yes") cystitis += 3;
  if (frequency === "yes") cystitis += 2;
  if (urgency === "yes") cystitis += 2;
  if (fever === "no") cystitis += 1;
  if (flankPain === "no") cystitis += 1;

  let pyelo = 0;
  if (flankPain === "yes") pyelo += 4;
  if (fever === "yes") pyelo += 3;
  if (chills === "yes") pyelo += 1;
  if (nausea === "yes") pyelo += 1;
  if (vomiting === "yes") pyelo += 1;

  let urosepsis = 0;
  if (fever === "yes") urosepsis += 3;
  if (confusion === "yes") urosepsis += 4;
  if (weakness === "yes") urosepsis += 3;
  if (chills === "yes") urosepsis += 2;

  let pregnancyUti = 0;
  if (pregnant === "yes") pregnancyUti += 6;
  if (dysuria === "yes") pregnancyUti += 2;
  if (frequency === "yes") pregnancyUti += 1;
  if (urgency === "yes") pregnancyUti += 1;

  let maleUti = 0;
  if (male === "yes") maleUti += 3;
  if (dysuria === "yes") maleUti += 2;
  if (frequency === "yes") maleUti += 1;

  let immuno = 0;
  if (immunocompromised === "yes") immuno += 4;
  if (fever === "yes") immuno += 3;
  if (dysuria === "yes") immuno += 1;

  let hematuria = 0;
  if (grossHematuria === "yes") hematuria += 4;
  if (clots === "yes") hematuria += 3;
  if (retention === "yes") hematuria += 2;

  let renalStone = 0;
  if (colickyPain === "yes") renalStone += 4;
  if (groinRadiation === "yes") renalStone += 3;
  if (grossHematuria === "yes") renalStone += 2;
  if (fever === "no") renalStone += 1;

  let stiMimic = 0;
  if (discharge === "yes") stiMimic += 3;
  if (newPartner === "yes") stiMimic += 3;
  if (genitalLesions === "yes") stiMimic += 2;
  if (dysuria === "yes") stiMimic += 1;

  let noUti = 0;
  if (dysuria === "no") noUti += 3;
  if (frequency === "no") noUti += 2;
  if (fever === "no") noUti += 1;
  if (flankPain === "no") noUti += 1;

  const allScores: Record<string, number> = {
    CL_GU_CYSTITIS: cystitis,
    CL_GU_PYELO: pyelo,
    CL_GU_UROSEPSIS: urosepsis,
    CL_GU_PREGNANCY_UTI: pregnancyUti,
    CL_GU_MALE_UTI: maleUti,
    CL_GU_IMMUNO: immuno,
    CL_GU_HEMATURIA: hematuria,
    CL_GU_RENAL_STONE: renalStone,
    CL_GU_STI_MIMIC: stiMimic,
    CL_GU_NO_UTI: noUti,
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
    cystitis, pyelo, urosepsis, pregnancyUti, maleUti,
    immuno, hematuria, renalStone, stiMimic, noUti
  );

  return {
    uti_score: composite,
    cystitis_score: cystitis,
    pyelo_score: pyelo,
    urosepsis_score: urosepsis,
    pregnancy_uti_score: pregnancyUti,
    male_uti_score: maleUti,
    immuno_score: immuno,
    hematuria_score: hematuria,
    renal_stone_score: renalStone,
    sti_mimic_score: stiMimic,
    no_uti_score: noUti,
    inputsUsed: used,
    cluster,
  };
}
