import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export interface DizzinessScoringResult {
  dizziness_score: number;
  bppv_score: number;
  vest_neuritis_score: number;
  stroke_score: number;
  orthostatic_score: number;
  cardiac_score: number;
  hypoglycemia_score: number;
  anemia_score: number;
  medication_score: number;
  inputsUsed: string[];
  cluster: string;
}

export function computeDizzinessScore(state: CaseState): DizzinessScoringResult {
  const a = state.answers;

  const spinning = tri(a["Q_DZ_SPINNING"]);
  const positional = tri(a["Q_DZ_POSITIONAL"]);
  const briefEpisodes = tri(a["Q_DZ_BRIEF"]);
  const prolonged = tri(a["Q_DZ_PROLONGED"]);
  const focalNeuro = tri(a["Q_DZ_FOCAL_NEURO"]);
  const facialDroop = tri(a["Q_DZ_FACIAL_DROOP"]);
  const speechTrouble = tri(a["Q_DZ_SPEECH"]);
  const diplopia = tri(a["Q_DZ_DIPLOPIA"]);
  const gaitUnsteady = tri(a["Q_DZ_GAIT"]);
  const standsWorse = tri(a["Q_DZ_STANDS_WORSE"]);
  const syncope = tri(a["Q_DZ_SYNCOPE"]);
  const palpitations = tri(a["Q_DZ_PALPITATIONS"]);
  const headache = tri(a["Q_DZ_HEADACHE"]);
  const neckStiff = tri(a["Q_DZ_NECK_STIFF"]);
  const melena = tri(a["Q_DZ_MELENA"]);
  const recentViral = tri(a["Q_DZ_RECENT_VIRAL"]);
  const newMed = tri(a["Q_DZ_NEW_MED"]);
  const diabetic = tri(a["Q_DZ_DIABETIC"]);
  const sweating = tri(a["Q_DZ_SWEATING"]);
  const poorIntake = tri(a["Q_DZ_POOR_INTAKE"]);

  const used = [
    "Q_DZ_SPINNING", "Q_DZ_POSITIONAL", "Q_DZ_BRIEF", "Q_DZ_PROLONGED",
    "Q_DZ_FOCAL_NEURO", "Q_DZ_FACIAL_DROOP", "Q_DZ_SPEECH", "Q_DZ_DIPLOPIA",
    "Q_DZ_GAIT", "Q_DZ_STANDS_WORSE", "Q_DZ_SYNCOPE", "Q_DZ_PALPITATIONS",
    "Q_DZ_HEADACHE", "Q_DZ_NECK_STIFF", "Q_DZ_MELENA", "Q_DZ_RECENT_VIRAL",
    "Q_DZ_NEW_MED", "Q_DZ_DIABETIC", "Q_DZ_SWEATING", "Q_DZ_POOR_INTAKE",
  ];

  let bppv = 0;
  if (spinning === "yes") bppv += 2;
  if (positional === "yes") bppv += 3;
  if (briefEpisodes === "yes") bppv += 2;
  if (focalNeuro === "no") bppv += 1;

  let vestNeuritis = 0;
  if (spinning === "yes") vestNeuritis += 2;
  if (prolonged === "yes") vestNeuritis += 2;
  if (recentViral === "yes") vestNeuritis += 2;
  if (gaitUnsteady === "yes") vestNeuritis += 1;
  if (focalNeuro === "no") vestNeuritis += 1;

  let stroke = 0;
  if (focalNeuro === "yes") stroke += 4;
  if (facialDroop === "yes") stroke += 3;
  if (speechTrouble === "yes") stroke += 3;
  if (diplopia === "yes") stroke += 2;
  if (gaitUnsteady === "yes") stroke += 2;
  if (headache === "yes") stroke += 1;

  let orthostatic = 0;
  if (standsWorse === "yes") orthostatic += 3;
  if (poorIntake === "yes") orthostatic += 2;
  if (spinning === "no") orthostatic += 1;
  if (focalNeuro === "no") orthostatic += 1;

  let cardiac = 0;
  if (syncope === "yes") cardiac += 3;
  if (palpitations === "yes") cardiac += 3;
  if (spinning === "no") cardiac += 1;

  let hypoglycemia = 0;
  if (diabetic === "yes") hypoglycemia += 3;
  if (sweating === "yes") hypoglycemia += 2;
  if (spinning === "no") hypoglycemia += 1;

  let anemia = 0;
  if (melena === "yes") anemia += 4;
  if (poorIntake === "yes") anemia += 1;
  if (standsWorse === "yes") anemia += 1;

  let medication = 0;
  if (newMed === "yes") medication += 4;
  if (focalNeuro === "no") medication += 1;
  if (spinning === "no") medication += 1;

  const allScores: Record<string, number> = {
    CL_NEURO_BPPV: bppv,
    CL_NEURO_VEST_NEURITIS: vestNeuritis,
    CL_NEURO_STROKE: stroke,
    CL_NEURO_ORTHOSTATIC: orthostatic,
    CL_NEURO_CARDIAC: cardiac,
    CL_NEURO_HYPOGLYCEMIA: hypoglycemia,
    CL_NEURO_ANEMIA: anemia,
    CL_NEURO_MEDICATION: medication,
  };

  let cluster = "UNCLASSIFIED";
  let maxScore = 0;
  for (const [cid, pts] of Object.entries(allScores)) {
    if (pts > maxScore) {
      maxScore = pts;
      cluster = cid;
    }
  }

  const composite = Math.max(bppv, vestNeuritis, stroke, orthostatic, cardiac, hypoglycemia, anemia, medication);

  return {
    dizziness_score: composite,
    bppv_score: bppv,
    vest_neuritis_score: vestNeuritis,
    stroke_score: stroke,
    orthostatic_score: orthostatic,
    cardiac_score: cardiac,
    hypoglycemia_score: hypoglycemia,
    anemia_score: anemia,
    medication_score: medication,
    inputsUsed: used,
    cluster,
  };
}
