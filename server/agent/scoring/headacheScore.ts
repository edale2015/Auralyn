import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface HeadacheScoringResult {
  headache_score: number;
  tension_score: number;
  migraine_score: number;
  sah_score: number;
  meningitis_ha_score: number;
  stroke_ha_score: number;
  gca_score: number;
  co_toxin_score: number;
  trauma_ha_score: number;
  htn_ha_score: number;
  cluster_ha_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeHeadacheScore(state: CaseState): HeadacheScoringResult {
  const a = state.answers;

  const bilateral = tri(a["Q_HA_BILATERAL"]);
  const bandLike = tri(a["Q_HA_BAND_LIKE"]);
  const stress = tri(a["Q_HA_STRESS"]);
  const unilateral = tri(a["Q_HA_UNILATERAL"]);
  const throbbing = tri(a["Q_HA_THROBBING"]);
  const photophobia = tri(a["Q_HA_PHOTOPHOBIA"]);
  const nausea = tri(a["Q_HA_NAUSEA"]);
  const priorMigraines = tri(a["Q_HA_PRIOR_MIGRAINES"]);
  const thunderclap = tri(a["Q_HA_THUNDERCLAP"]);
  const worstEver = tri(a["Q_HA_WORST_EVER"]);
  const fever = tri(a["Q_HA_FEVER"]);
  const neckStiff = tri(a["Q_HA_NECK_STIFF"]);
  const confusion = tri(a["Q_HA_CONFUSION"]);
  const weakness = tri(a["Q_HA_WEAKNESS"]);
  const numbness = tri(a["Q_HA_NUMBNESS"]);
  const speechChanges = tri(a["Q_HA_SPEECH_CHANGES"]);
  const ageOver50 = tri(a["Q_HA_AGE_OVER_50"]);
  const newHeadache = tri(a["Q_HA_NEW_HEADACHE"]);
  const jawClaudication = tri(a["Q_HA_JAW_CLAUDICATION"]);
  const visionChanges = tri(a["Q_HA_VISION_CHANGES"]);
  const householdSick = tri(a["Q_HA_HOUSEHOLD_SICK"]);
  const trauma = tri(a["Q_HA_TRAUMA"]);
  const vomiting = tri(a["Q_HA_VOMITING"]);
  const anticoag = tri(a["Q_HA_ANTICOAG"]);
  const neuroSymptoms = tri(a["Q_HA_NEURO_SYMPTOMS"]);
  const orbital = tri(a["Q_HA_ORBITAL"]);
  const tearing = tri(a["Q_HA_TEARING"]);
  const restless = tri(a["Q_HA_RESTLESS"]);
  const recurrentPattern = tri(a["Q_HA_RECURRENT_PATTERN"]);

  const used = [
    "Q_HA_BILATERAL", "Q_HA_BAND_LIKE", "Q_HA_STRESS", "Q_HA_UNILATERAL",
    "Q_HA_THROBBING", "Q_HA_PHOTOPHOBIA", "Q_HA_NAUSEA", "Q_HA_PRIOR_MIGRAINES",
    "Q_HA_THUNDERCLAP", "Q_HA_WORST_EVER", "Q_HA_FEVER", "Q_HA_NECK_STIFF",
    "Q_HA_CONFUSION", "Q_HA_WEAKNESS", "Q_HA_NUMBNESS", "Q_HA_SPEECH_CHANGES",
    "Q_HA_AGE_OVER_50", "Q_HA_NEW_HEADACHE", "Q_HA_JAW_CLAUDICATION",
    "Q_HA_VISION_CHANGES", "Q_HA_HOUSEHOLD_SICK", "Q_HA_TRAUMA", "Q_HA_VOMITING",
    "Q_HA_ANTICOAG", "Q_HA_NEURO_SYMPTOMS", "Q_HA_ORBITAL", "Q_HA_TEARING",
    "Q_HA_RESTLESS", "Q_HA_RECURRENT_PATTERN",
  ];

  let tension = 0;
  if (bilateral === "yes") tension += 3;
  if (bandLike === "yes") tension += 3;
  if (stress === "yes") tension += 2;
  if (throbbing === "no") tension += 1;

  let migraine = 0;
  if (unilateral === "yes") migraine += 3;
  if (throbbing === "yes") migraine += 2;
  if (photophobia === "yes") migraine += 2;
  if (nausea === "yes") migraine += 1;
  if (priorMigraines === "yes") migraine += 2;

  let sah = 0;
  if (thunderclap === "yes") sah += 5;
  if (worstEver === "yes") sah += 4;
  if (neckStiff === "yes") sah += 2;
  if (vomiting === "yes") sah += 1;

  let meningitisHa = 0;
  if (fever === "yes") meningitisHa += 4;
  if (neckStiff === "yes") meningitisHa += 4;
  if (photophobia === "yes") meningitisHa += 1;
  if (confusion === "yes") meningitisHa += 2;

  let strokeHa = 0;
  if (weakness === "yes") strokeHa += 4;
  if (numbness === "yes") strokeHa += 3;
  if (speechChanges === "yes") strokeHa += 4;
  if (visionChanges === "yes") strokeHa += 1;

  let gca = 0;
  if (ageOver50 === "yes") gca += 3;
  if (newHeadache === "yes") gca += 2;
  if (jawClaudication === "yes") gca += 3;
  if (visionChanges === "yes") gca += 3;

  let coToxin = 0;
  if (householdSick === "yes") coToxin += 4;
  if (nausea === "yes") coToxin += 2;
  if (bilateral === "yes") coToxin += 1;

  let traumaHa = 0;
  if (trauma === "yes") traumaHa += 4;
  if (vomiting === "yes") traumaHa += 2;
  if (confusion === "yes") traumaHa += 3;
  if (anticoag === "yes") traumaHa += 3;

  let htnHa = 0;
  if (neuroSymptoms === "yes") htnHa += 3;
  if (visionChanges === "yes") htnHa += 3;
  if (nausea === "yes") htnHa += 1;

  let clusterHa = 0;
  if (orbital === "yes") clusterHa += 4;
  if (tearing === "yes") clusterHa += 3;
  if (restless === "yes") clusterHa += 2;
  if (recurrentPattern === "yes") clusterHa += 2;
  if (unilateral === "yes") clusterHa += 1;

  const allScores: Record<string, number> = {
    CL_NEURO_TENSION: tension,
    CL_NEURO_MIGRAINE: migraine,
    CL_NEURO_SAH: sah,
    CL_NEURO_MENINGITIS_HA: meningitisHa,
    CL_NEURO_STROKE_HA: strokeHa,
    CL_NEURO_GCA: gca,
    CL_NEURO_CO_TOXIN: coToxin,
    CL_NEURO_TRAUMA_HA: traumaHa,
    CL_NEURO_HTN_HA: htnHa,
    CL_NEURO_CLUSTER_HA: clusterHa,
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
    tension, migraine, sah, meningitisHa, strokeHa,
    gca, coToxin, traumaHa, htnHa, clusterHa
  );

  return {
    headache_score: composite,
    tension_score: tension,
    migraine_score: migraine,
    sah_score: sah,
    meningitis_ha_score: meningitisHa,
    stroke_ha_score: strokeHa,
    gca_score: gca,
    co_toxin_score: coToxin,
    trauma_ha_score: traumaHa,
    htn_ha_score: htnHa,
    cluster_ha_score: clusterHa,
    inputsUsed: used,
    cluster,
  };
}
