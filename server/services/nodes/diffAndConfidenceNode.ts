import { getTable } from "../../data/registry";
import type { CaseState } from "../../../shared/agentTypes";

type Row = Record<string, any>;

const boolish = (v: any): boolean | null => {
  if (v === true || v === "true" || v === "yes" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === "no" || v === 0 || v === "0") return false;
  return null;
};

const numish = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface DiffResult {
  updated: CaseState;
  outputs: Record<string, any>;
  ruleRefs: string[];
  confidence: string;
}

export async function runDiffAndConfidenceNode(state: CaseState): Promise<DiffResult> {
  const s = state as any;
  const cc = String(s.normalizedComplaint || "");
  const A: Record<string, any> = s.answers || {};
  const centor = numish(s.scores?.centor);

  const clusterRows: Row[] = await getTable("GLOBAL_CLUSTER_MASTER");
  const dxRows: Row[] = await getTable("CLUSTER_PRIMARY_DIAGNOSIS");

  const validClusters = new Set(
    clusterRows.map(r => String(r.Cluster_ID || r.CLUSTER_ID || "")).filter(Boolean)
  );

  const dxByCluster = new Map<string, Array<{ diagnosisId: string; diagnosisName: string }>>();
  for (const r of dxRows) {
    const clusterId = String(r.Cluster_ID || r.CLUSTER_ID || "");
    const diagnosisId = String(r.Diagnosis_ID || r.DIAGNOSIS_ID || "");
    const diagnosisName = String(r.Diagnosis_Name || r.DIAGNOSIS_NAME || r.Diagnosis_Name_SafeFill || "");
    if (!clusterId || !diagnosisId) continue;
    if (!dxByCluster.has(clusterId)) dxByCluster.set(clusterId, []);
    dxByCluster.get(clusterId)!.push({ diagnosisId, diagnosisName });
  }

  const score: Record<string, { points: number; evidence: string[] }> = {};
  const bump = (clusterId: string, pts: number, evidence: string, skipValidation = false) => {
    if (!skipValidation && !validClusters.has(clusterId)) return;
    if (pts <= 0) return;
    if (!score[clusterId]) score[clusterId] = { points: 0, evidence: [] };
    score[clusterId].points += pts;
    score[clusterId].evidence.push(evidence);
  };

  if (cc === "sore_throat") {
    if (boolish(A.ST_COUGH) === true) bump("CL_ST_VIRAL_URI", 2, "answers.ST_COUGH");
    if (boolish(A.ST_RUNNY) === true) bump("CL_ST_VIRAL_URI", 2, "answers.ST_RUNNY");
    if (boolish(A.ST_HOARSE) === true) bump("CL_ST_VIRAL_URI", 1, "answers.ST_HOARSE");

    if (boolish(A.ST_FEVER) === true) bump("CL_ST_GAS", 1, "answers.ST_FEVER");
    if (boolish(A.ST_COUGH) === false) bump("CL_ST_GAS", 1, "answers.ST_COUGH");
    if (centor >= 2) bump("CL_ST_GAS", 2, "scores.centor");

    if (boolish(A.ST_MONO) === true) bump("CL_ST_MONO", 2, "answers.ST_MONO");
  } else if (cc === "earache") {
    const oeScore = numish(s.scores?.oe_score);
    const aomScore = numish(s.scores?.aom_score);
    const tmjScore = numish(s.scores?.tmj_score);
    const etdScore = numish(s.scores?.etd_score);

    if (oeScore > 0) bump("CL_EA_OE", oeScore, "scores.oe_score");
    if (aomScore > 0) bump("CL_EA_AOM", aomScore, "scores.aom_score");
    if (tmjScore > 0) bump("CL_EA_TMJ", tmjScore, "scores.tmj_score");
    if (etdScore > 0) bump("CL_EA_ETD", etdScore, "scores.etd_score");

    if (boolish(A.Q_EA_NECK_SWELLING) === true && boolish(A.Q_EA_SOUR_PAIN) === true) {
      bump("CL_EA_SALIVARY", 4, "answers.Q_EA_NECK_SWELLING+Q_EA_SOUR_PAIN");
    } else if (boolish(A.Q_EA_NECK_SWELLING) === true) {
      bump("CL_EA_SALIVARY", 2, "answers.Q_EA_NECK_SWELLING");
    }
  } else if (cc === "persistent_cough") {
    const peScore = numish(s.scores?.pe_score);
    const pneumoniaScore = numish(s.scores?.pneumonia_score);
    const asthmaExac = numish(s.scores?.asthma_exac_score);
    const copdExac = numish(s.scores?.copd_exac_score);
    const viralUri = numish(s.scores?.viral_uri_score);
    const infectionScore = numish(s.scores?.infection_score);
    const pndScore = numish(s.scores?.pnd_score);
    const gerdScore = numish(s.scores?.gerd_score);

    if (peScore > 0) bump("CL_PULM_PE_OVERLAP", peScore, "scores.pe_score", true);
    if (pneumoniaScore > 0) bump("CL_PULM_PNEUMONIA", pneumoniaScore, "scores.pneumonia_score", true);
    if (asthmaExac > 0) bump("CL_PULM_ASTHMA_EXAC", asthmaExac, "scores.asthma_exac_score", true);
    if (copdExac > 0) bump("CL_PULM_COPD_EXAC", copdExac, "scores.copd_exac_score", true);
    if (infectionScore > 0) bump("CL_PULM_INFECTION", infectionScore, "scores.infection_score", true);
    if (pndScore > 0) bump("CL_PULM_UACS_PND", pndScore, "scores.pnd_score", true);
    if (gerdScore > 0) bump("CL_PULM_GERD_COUGH", gerdScore, "scores.gerd_score", true);

    const gateResult = s.redFlagGate?.gateResult;
    const hasDangerSignals = gateResult === "ER_SEND" || gateResult === "ESCALATE";
    const hasSpecificCondition = asthmaExac >= 3 || copdExac >= 4 || pndScore >= 4 || gerdScore >= 4 || infectionScore >= 3;
    if (!hasDangerSignals && !hasSpecificCondition && viralUri > 0) {
      bump("CL_PULM_VIRAL_URI", viralUri, "scores.viral_uri_score", true);
    }
  } else if (cc === "chest_pain") {
    const acsScore = numish(s.scores?.acs_score);
    const peCpScore = numish(s.scores?.pe_cp_score);
    const dissectionScore = numish(s.scores?.dissection_score);
    const pericarditisScore = numish(s.scores?.pericarditis_score);
    const pneumoniaCpScore = numish(s.scores?.pneumonia_cp_score);
    const gerdCpScore = numish(s.scores?.gerd_cp_score);
    const mskScore = numish(s.scores?.msk_score);
    const anxietyScore = numish(s.scores?.anxiety_score);

    if (acsScore > 0) bump("CL_CARD_ACS", acsScore, "scores.acs_score", true);
    if (peCpScore > 0) bump("CL_CARD_PE", peCpScore, "scores.pe_cp_score", true);
    if (dissectionScore > 0) bump("CL_CARD_DISSECTION", dissectionScore, "scores.dissection_score", true);
    if (pericarditisScore > 0) bump("CL_CARD_PERICARDITIS", pericarditisScore, "scores.pericarditis_score", true);
    if (pneumoniaCpScore > 0) bump("CL_CARD_PNEUMONIA", pneumoniaCpScore, "scores.pneumonia_cp_score", true);
    if (gerdCpScore > 0) bump("CL_CARD_GERD", gerdCpScore, "scores.gerd_cp_score", true);
    if (mskScore > 0) bump("CL_CARD_MSK", mskScore, "scores.msk_score", true);
    if (anxietyScore > 0) bump("CL_CARD_ANXIETY", anxietyScore, "scores.anxiety_score", true);
  } else if (cc === "dizziness") {
    const bppvScore = numish(s.scores?.bppv_score);
    const vestNeuritisScore = numish(s.scores?.vest_neuritis_score);
    const strokeScore = numish(s.scores?.stroke_score);
    const orthostaticScore = numish(s.scores?.orthostatic_score);
    const cardiacScore = numish(s.scores?.cardiac_score);
    const hypoglycemiaScore = numish(s.scores?.hypoglycemia_score);
    const anemiaScore = numish(s.scores?.anemia_score);
    const medicationScore = numish(s.scores?.medication_score);

    if (bppvScore > 0) bump("CL_NEURO_BPPV", bppvScore, "scores.bppv_score", true);
    if (vestNeuritisScore > 0) bump("CL_NEURO_VEST_NEURITIS", vestNeuritisScore, "scores.vest_neuritis_score", true);
    if (strokeScore > 0) bump("CL_NEURO_STROKE", strokeScore, "scores.stroke_score", true);
    if (orthostaticScore > 0) bump("CL_NEURO_ORTHOSTATIC", orthostaticScore, "scores.orthostatic_score", true);
    if (cardiacScore > 0) bump("CL_NEURO_CARDIAC", cardiacScore, "scores.cardiac_score", true);
    if (hypoglycemiaScore > 0) bump("CL_NEURO_HYPOGLYCEMIA", hypoglycemiaScore, "scores.hypoglycemia_score", true);
    if (anemiaScore > 0) bump("CL_NEURO_ANEMIA", anemiaScore, "scores.anemia_score", true);
    if (medicationScore > 0) bump("CL_NEURO_MEDICATION", medicationScore, "scores.medication_score", true);
  } else if (cc === "abdominal_pain") {
    const gastroenteritisScore = numish(s.scores?.gastroenteritis_score);
    const appendicitisScore = numish(s.scores?.appendicitis_score);
    const cholecystitisScore = numish(s.scores?.cholecystitis_score);
    const pancreatitisScore = numish(s.scores?.pancreatitis_score);
    const giBleedScore = numish(s.scores?.gi_bleed_score);
    const aaaScore = numish(s.scores?.aaa_score);
    const diverticulitisScore = numish(s.scores?.diverticulitis_score);
    const renalColicScore = numish(s.scores?.renal_colic_score);
    const ectopicScore = numish(s.scores?.ectopic_score);
    const mesentericScore = numish(s.scores?.mesenteric_score);

    if (gastroenteritisScore > 0) bump("CL_GI_GASTROENTERITIS", gastroenteritisScore, "scores.gastroenteritis_score", true);
    if (appendicitisScore > 0) bump("CL_GI_APPENDICITIS", appendicitisScore, "scores.appendicitis_score", true);
    if (cholecystitisScore > 0) bump("CL_GI_CHOLECYSTITIS", cholecystitisScore, "scores.cholecystitis_score", true);
    if (pancreatitisScore > 0) bump("CL_GI_PANCREATITIS", pancreatitisScore, "scores.pancreatitis_score", true);
    if (giBleedScore > 0) bump("CL_GI_GI_BLEED", giBleedScore, "scores.gi_bleed_score", true);
    if (aaaScore > 0) bump("CL_GI_AAA", aaaScore, "scores.aaa_score", true);
    if (diverticulitisScore > 0) bump("CL_GI_DIVERTICULITIS", diverticulitisScore, "scores.diverticulitis_score", true);
    if (renalColicScore > 0) bump("CL_GI_RENAL_COLIC", renalColicScore, "scores.renal_colic_score", true);
    if (ectopicScore > 0) bump("CL_GI_ECTOPIC", ectopicScore, "scores.ectopic_score", true);
    if (mesentericScore > 0) bump("CL_GI_MESENTERIC", mesentericScore, "scores.mesenteric_score", true);
  } else if (cc === "gu_uti_symptoms") {
    const cystitisScore = numish(s.scores?.cystitis_score);
    const pyeloScore = numish(s.scores?.pyelo_score);
    const urosepsisScore = numish(s.scores?.urosepsis_score);
    const pregnancyUtiScore = numish(s.scores?.pregnancy_uti_score);
    const maleUtiScore = numish(s.scores?.male_uti_score);
    const utiImmunoScore = numish(s.scores?.uti_immuno_score);
    const hematuriaScore = numish(s.scores?.hematuria_score);
    const utiRenalStoneScore = numish(s.scores?.uti_renal_stone_score);
    const stiMimicScore = numish(s.scores?.sti_mimic_score);
    const noUtiScore = numish(s.scores?.no_uti_score);

    if (cystitisScore > 0) bump("CL_GU_CYSTITIS", cystitisScore, "scores.cystitis_score", true);
    if (pyeloScore > 0) bump("CL_GU_PYELO", pyeloScore, "scores.pyelo_score", true);
    if (urosepsisScore > 0) bump("CL_GU_UROSEPSIS", urosepsisScore, "scores.urosepsis_score", true);
    if (pregnancyUtiScore > 0) bump("CL_GU_PREGNANCY_UTI", pregnancyUtiScore, "scores.pregnancy_uti_score", true);
    if (maleUtiScore > 0) bump("CL_GU_MALE_UTI", maleUtiScore, "scores.male_uti_score", true);
    if (utiImmunoScore > 0) bump("CL_GU_IMMUNO", utiImmunoScore, "scores.uti_immuno_score", true);
    if (hematuriaScore > 0) bump("CL_GU_HEMATURIA", hematuriaScore, "scores.hematuria_score", true);
    if (utiRenalStoneScore > 0) bump("CL_GU_RENAL_STONE", utiRenalStoneScore, "scores.uti_renal_stone_score", true);
    if (stiMimicScore > 0) bump("CL_GU_STI_MIMIC", stiMimicScore, "scores.sti_mimic_score", true);
    if (noUtiScore > 0) bump("CL_GU_NO_UTI", noUtiScore, "scores.no_uti_score", true);
  } else if (cc === "gu_testicular_pain_prostatitis") {
    const torsionScore = numish(s.scores?.torsion_score);
    const epidStiScore = numish(s.scores?.epid_sti_score);
    const epidEntericScore = numish(s.scores?.epid_enteric_score);
    const fournierScore = numish(s.scores?.fournier_score);
    const herniaScore = numish(s.scores?.hernia_score);
    const prostatitisScore = numish(s.scores?.prostatitis_score);
    const tpTraumaScore = numish(s.scores?.tp_trauma_score);
    const varicoceleScore = numish(s.scores?.varicocele_score);
    const stoneRefScore = numish(s.scores?.stone_ref_score);
    const benignTpScore = numish(s.scores?.benign_tp_score);

    if (torsionScore > 0) bump("CL_GU_TORSION", torsionScore, "scores.torsion_score", true);
    if (epidStiScore > 0) bump("CL_GU_EPID_STI", epidStiScore, "scores.epid_sti_score", true);
    if (epidEntericScore > 0) bump("CL_GU_EPID_ENTERIC", epidEntericScore, "scores.epid_enteric_score", true);
    if (fournierScore > 0) bump("CL_GU_FOURNIER", fournierScore, "scores.fournier_score", true);
    if (herniaScore > 0) bump("CL_GU_HERNIA", herniaScore, "scores.hernia_score", true);
    if (prostatitisScore > 0) bump("CL_GU_PROSTATITIS", prostatitisScore, "scores.prostatitis_score", true);
    if (tpTraumaScore > 0) bump("CL_GU_TRAUMA", tpTraumaScore, "scores.tp_trauma_score", true);
    if (varicoceleScore > 0) bump("CL_GU_VARICOCELE", varicoceleScore, "scores.varicocele_score", true);
    if (stoneRefScore > 0) bump("CL_GU_STONE_REF", stoneRefScore, "scores.stone_ref_score", true);
    if (benignTpScore > 0) bump("CL_GU_BENIGN_TP", benignTpScore, "scores.benign_tp_score", true);
  } else if (cc === "gyn_pelvic_pain") {
    const ppEctopicScore = numish(s.scores?.pp_ectopic_score);
    const ppTorsionScore = numish(s.scores?.pp_torsion_score);
    const pidScore = numish(s.scores?.pid_score);
    const rupturedCystScore = numish(s.scores?.ruptured_cyst_score);
    const endometriosisScore = numish(s.scores?.endometriosis_score);
    const fibroidsScore = numish(s.scores?.fibroids_score);
    const ppUtiMimicScore = numish(s.scores?.pp_uti_mimic_score);
    const ppAppendicitisScore = numish(s.scores?.pp_appendicitis_score);
    const ppSepsisScore = numish(s.scores?.pp_sepsis_score);
    const benignPpScore = numish(s.scores?.benign_pp_score);

    if (ppEctopicScore > 0) bump("CL_GYN_ECTOPIC", ppEctopicScore, "scores.pp_ectopic_score", true);
    if (ppTorsionScore > 0) bump("CL_GYN_TORSION", ppTorsionScore, "scores.pp_torsion_score", true);
    if (pidScore > 0) bump("CL_GYN_PID", pidScore, "scores.pid_score", true);
    if (rupturedCystScore > 0) bump("CL_GYN_RUPTURED_CYST", rupturedCystScore, "scores.ruptured_cyst_score", true);
    if (endometriosisScore > 0) bump("CL_GYN_ENDOMETRIOSIS", endometriosisScore, "scores.endometriosis_score", true);
    if (fibroidsScore > 0) bump("CL_GYN_FIBROIDS", fibroidsScore, "scores.fibroids_score", true);
    if (ppUtiMimicScore > 0) bump("CL_GYN_UTI_MIMIC", ppUtiMimicScore, "scores.pp_uti_mimic_score", true);
    if (ppAppendicitisScore > 0) bump("CL_GYN_APPENDICITIS", ppAppendicitisScore, "scores.pp_appendicitis_score", true);
    if (ppSepsisScore > 0) bump("CL_GYN_SEPSIS", ppSepsisScore, "scores.pp_sepsis_score", true);
    if (benignPpScore > 0) bump("CL_GYN_BENIGN", benignPpScore, "scores.benign_pp_score", true);
  } else if (cc === "neuro_headache") {
    const tensionScore = numish(s.scores?.tension_score);
    const migraineScore = numish(s.scores?.migraine_score);
    const sahScore = numish(s.scores?.sah_score);
    const meningitisHaScore = numish(s.scores?.meningitis_ha_score);
    const strokeHaScore = numish(s.scores?.stroke_ha_score);
    const gcaScore = numish(s.scores?.gca_score);
    const coToxinScore = numish(s.scores?.co_toxin_score);
    const traumaHaScore = numish(s.scores?.trauma_ha_score);
    const htnHaScore = numish(s.scores?.htn_ha_score);
    const clusterHaScore = numish(s.scores?.cluster_ha_score);

    if (tensionScore > 0) bump("CL_NEURO_TENSION", tensionScore, "scores.tension_score", true);
    if (migraineScore > 0) bump("CL_NEURO_MIGRAINE", migraineScore, "scores.migraine_score", true);
    if (sahScore > 0) bump("CL_NEURO_SAH", sahScore, "scores.sah_score", true);
    if (meningitisHaScore > 0) bump("CL_NEURO_MENINGITIS_HA", meningitisHaScore, "scores.meningitis_ha_score", true);
    if (strokeHaScore > 0) bump("CL_NEURO_STROKE_HA", strokeHaScore, "scores.stroke_ha_score", true);
    if (gcaScore > 0) bump("CL_NEURO_GCA", gcaScore, "scores.gca_score", true);
    if (coToxinScore > 0) bump("CL_NEURO_CO_TOXIN", coToxinScore, "scores.co_toxin_score", true);
    if (traumaHaScore > 0) bump("CL_NEURO_TRAUMA_HA", traumaHaScore, "scores.trauma_ha_score", true);
    if (htnHaScore > 0) bump("CL_NEURO_HTN_HA", htnHaScore, "scores.htn_ha_score", true);
    if (clusterHaScore > 0) bump("CL_NEURO_CLUSTER_HA", clusterHaScore, "scores.cluster_ha_score", true);
  }

  const ranked = Object.entries(score)
    .map(([clusterId, v]) => ({ clusterId, points: v.points, evidence: v.evidence }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  s.clusterScores = Object.fromEntries(ranked.map(r => [r.clusterId, r.points]));
  s.clusterEvidence = Object.fromEntries(ranked.map(r => [r.clusterId, r.evidence]));
  s.activeClusters = ranked.map(r => r.clusterId);

  const dxCandidates: Array<{
    diagnosisId: string;
    diagnosisName: string;
    clusterId: string;
    confidence: "MODERATE" | "LOW";
  }> = [];

  ranked.forEach((r, idx) => {
    const dxs = (dxByCluster.get(r.clusterId) || []).slice(0, 2);
    const conf: "MODERATE" | "LOW" = idx === 0 ? "MODERATE" : "LOW";
    for (const d of dxs) {
      dxCandidates.push({ ...d, clusterId: r.clusterId, confidence: conf });
    }
  });
  s.diagnosisCandidates = dxCandidates.slice(0, 6);

  const missingRequired = (s.questionQueue || []).some((q: any) => q.required && !q.answered);
  const confidence =
    s.redFlagGate?.gateResult === "ER_SEND" ? "HIGH" :
    missingRequired ? "LOW" :
    ranked.length > 0 ? "MODERATE" : "LOW";
  s.caseConfidence = confidence;

  const ruleRefs = [
    ...s.activeClusters,
    ...(s.diagnosisCandidates || []).map((d: any) => d.diagnosisId),
  ];

  return {
    updated: state,
    confidence,
    ruleRefs,
    outputs: {
      rankedClusters: ranked,
      activeClusters: s.activeClusters,
      dxCount: (s.diagnosisCandidates || []).length,
    },
  };
}
