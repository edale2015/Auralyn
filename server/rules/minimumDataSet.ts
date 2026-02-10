export interface ComplaintDataSet {
  complaintId: string;
  label: string;
  requiredQuestionIds: string[];
  niceToHaveQuestionIds: string[];
}

const COMPLAINT_DATA_SETS: ComplaintDataSet[] = [
  {
    complaintId: "sore_throat",
    label: "Sore Throat / Pharyngitis",
    requiredQuestionIds: [
      "Q_FEVER",
      "Q_COUGH",
      "Q_TONSILLAR_EXUDATE",
      "Q_TENDER_ANT_CERV_NODES",
      "Q_DURATION_DAYS",
    ],
    niceToHaveQuestionIds: [
      "Q_DIFFICULTY_SWALLOWING",
      "Q_VOICE_CHANGES",
      "Q_RASH",
      "Q_RECENT_SICK_CONTACTS",
    ],
  },
  {
    complaintId: "ear_pain",
    label: "Ear Pain / Otitis",
    requiredQuestionIds: [
      "Q_EAR_PAIN_DURATION",
      "Q_FEVER",
      "Q_EAR_DISCHARGE",
      "Q_HEARING_CHANGE",
    ],
    niceToHaveQuestionIds: [
      "Q_RECENT_URI",
      "Q_SWIMMING",
      "Q_PRIOR_EAR_INFECTIONS",
    ],
  },
  {
    complaintId: "nasal_congestion",
    label: "Nasal Congestion / Sinusitis",
    requiredQuestionIds: [
      "Q_DURATION_DAYS",
      "Q_FEVER",
      "Q_FACIAL_PAIN",
      "Q_NASAL_DISCHARGE_COLOR",
    ],
    niceToHaveQuestionIds: [
      "Q_COUGH",
      "Q_TOOTH_PAIN",
      "Q_HEADACHE",
      "Q_PRIOR_SINUS_ISSUES",
    ],
  },
  {
    complaintId: "cough",
    label: "Cough",
    requiredQuestionIds: [
      "Q_COUGH_DURATION",
      "Q_FEVER",
      "Q_SHORTNESS_OF_BREATH",
      "Q_COUGH_PRODUCTIVE",
    ],
    niceToHaveQuestionIds: [
      "Q_WHEEZING",
      "Q_CHEST_PAIN",
      "Q_SMOKING_HISTORY",
      "Q_RECENT_SICK_CONTACTS",
    ],
  },
];

let registry: Map<string, ComplaintDataSet> | null = null;

function getRegistry(): Map<string, ComplaintDataSet> {
  if (!registry) {
    registry = new Map();
    for (const ds of COMPLAINT_DATA_SETS) {
      registry.set(ds.complaintId, ds);
    }
  }
  return registry;
}

export function getComplaintDataSet(complaintId: string): ComplaintDataSet | undefined {
  return getRegistry().get(complaintId);
}

export function getAllComplaintDataSets(): ComplaintDataSet[] {
  return [...getRegistry().values()];
}

export interface MdsValidationResult {
  complaintId: string;
  pass: boolean;
  requiredAnswered: string[];
  requiredMissing: string[];
  niceToHaveAnswered: string[];
  niceToHaveMissing: string[];
  completionPct: number;
}

export function validateMinimumDataSet(
  complaintId: string,
  answeredQuestionIds: Set<string>,
  isEmergent: boolean
): MdsValidationResult | null {
  const ds = getComplaintDataSet(complaintId);
  if (!ds) return null;

  const requiredAnswered = ds.requiredQuestionIds.filter(q => answeredQuestionIds.has(q));
  const requiredMissing = ds.requiredQuestionIds.filter(q => !answeredQuestionIds.has(q));
  const niceToHaveAnswered = ds.niceToHaveQuestionIds.filter(q => answeredQuestionIds.has(q));
  const niceToHaveMissing = ds.niceToHaveQuestionIds.filter(q => !answeredQuestionIds.has(q));

  const pass = isEmergent || requiredMissing.length === 0;
  const total = ds.requiredQuestionIds.length + ds.niceToHaveQuestionIds.length;
  const answered = requiredAnswered.length + niceToHaveAnswered.length;
  const completionPct = total > 0 ? Math.round((answered / total) * 1000) / 10 : 100;

  return {
    complaintId,
    pass,
    requiredAnswered,
    requiredMissing,
    niceToHaveAnswered,
    niceToHaveMissing,
    completionPct,
  };
}
