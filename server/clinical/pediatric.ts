/**
 * Pediatric Risk Scoring — PEWS + PAWSS
 *
 * PEWS (Pediatric Early Warning Score):
 *   Validated in-patient deterioration tool across 3 domains:
 *   - Behavior (0–3): playing/sleeping → lethargic/unresponsive
 *   - Cardiovascular (0–3): normal → severe shock signs
 *   - Respiratory (0–3): normal → apnea/severe distress
 *   Score ≥ 4 = urgent review; ≥ 6 = immediate escalation
 *
 * Reference: Monaghan A, Arch Dis Child 2005; Tucker KM, J Pediatr Nurs 2009
 */

// Age thresholds for HR/RR norms (in years)
const HR_NORMS = [
  { maxAge: 1,  normal: [100, 160], concerning: [90, 180] },
  { maxAge: 5,  normal: [95, 140],  concerning: [80, 160] },
  { maxAge: 12, normal: [80, 120],  concerning: [60, 140] },
  { maxAge: 18, normal: [60, 100],  concerning: [50, 120] },
];

const RR_NORMS = [
  { maxAge: 1,  normal: [30, 60], concerning: [25, 70] },
  { maxAge: 5,  normal: [20, 40], concerning: [18, 50] },
  { maxAge: 12, normal: [15, 30], concerning: [12, 35] },
  { maxAge: 18, normal: [12, 20], concerning: [10, 25] },
];

export interface PedsVitals {
  ageYears:              number;
  heartRate?:            number;
  respiratoryRate?:      number;
  spo2?:                 number;
  supplementalO2?:       boolean;
  systolicBP?:           number;
  behavior?:             "normal" | "sleeping" | "irritable" | "lethargic" | "confused" | "unresponsive";
  respiratoryDistress?:  "none" | "mild" | "moderate" | "severe" | "apnea";
  capillaryRefill?:      number;   // seconds
  skinColor?:            "normal" | "pale" | "mottled" | "cyanotic";
}

export interface PewsResult {
  score:           number;
  riskLevel:       "low" | "medium" | "high" | "critical";
  escalate:        boolean;
  disposition:     "ER_NOW" | "URGENT_24H" | "MONITOR";
  domains: {
    behavior:       number;
    cardiovascular: number;
    respiratory:    number;
  };
  rationale:       string;
}

function behaviorScore(behavior?: string): number {
  switch (behavior) {
    case "normal":       return 0;
    case "sleeping":     return 0;
    case "irritable":    return 1;
    case "lethargic":    return 2;
    case "confused":     return 2;
    case "unresponsive": return 3;
    default:             return 0;
  }
}

function respiratoryScore(vitals: PedsVitals, ageNorms: typeof RR_NORMS[0]): number {
  let score = 0;
  if (vitals.respiratoryDistress === "severe" || vitals.respiratoryDistress === "apnea") score = 3;
  else if (vitals.respiratoryDistress === "moderate") score = 2;
  else if (vitals.respiratoryDistress === "mild") score = 1;

  if (vitals.spo2 !== undefined && !vitals.supplementalO2) {
    if (vitals.spo2 < 90)  score = Math.max(score, 3);
    else if (vitals.spo2 < 93) score = Math.max(score, 2);
    else if (vitals.spo2 < 95) score = Math.max(score, 1);
  }

  if (vitals.respiratoryRate !== undefined) {
    if (vitals.respiratoryRate < ageNorms.concerning[0] || vitals.respiratoryRate > ageNorms.concerning[1]) {
      score = Math.max(score, 2);
    }
  }

  return Math.min(score, 3);
}

function cardioScore(vitals: PedsVitals, hrNorms: typeof HR_NORMS[0]): number {
  let score = 0;

  if (vitals.heartRate !== undefined) {
    if (vitals.heartRate < hrNorms.concerning[0] || vitals.heartRate > hrNorms.concerning[1]) score = 2;
    else if (vitals.heartRate < hrNorms.normal[0] || vitals.heartRate > hrNorms.normal[1]) score = 1;
  }

  if (vitals.capillaryRefill !== undefined) {
    if (vitals.capillaryRefill > 5) score = Math.max(score, 3);
    else if (vitals.capillaryRefill > 3) score = Math.max(score, 2);
    else if (vitals.capillaryRefill > 2) score = Math.max(score, 1);
  }

  if (vitals.skinColor === "cyanotic") score = Math.max(score, 3);
  else if (vitals.skinColor === "mottled") score = Math.max(score, 2);
  else if (vitals.skinColor === "pale") score = Math.max(score, 1);

  return Math.min(score, 3);
}

function getAgeNorm<T extends { maxAge: number }>(norms: T[], age: number): T {
  return norms.find((n) => age <= n.maxAge) ?? norms[norms.length - 1];
}

export function PEWS(vitals: PedsVitals): PewsResult {
  const hrNorm = getAgeNorm(HR_NORMS, vitals.ageYears);
  const rrNorm = getAgeNorm(RR_NORMS, vitals.ageYears);

  const behavior      = behaviorScore(vitals.behavior);
  const respiratory   = respiratoryScore(vitals, rrNorm);
  const cardiovascular = cardioScore(vitals, hrNorm);
  const score         = behavior + respiratory + cardiovascular;

  const riskLevel   = score <= 1 ? "low" : score <= 3 ? "medium" : score <= 5 ? "high" : "critical";
  const escalate    = score >= 4;
  const disposition = score >= 6 ? "ER_NOW" : score >= 4 ? "URGENT_24H" : "MONITOR";

  return {
    score,
    riskLevel,
    escalate,
    disposition,
    domains: { behavior, cardiovascular, respiratory },
    rationale: `PEWS ${score}/9 (${riskLevel}) — behavior ${behavior}, cardio ${cardiovascular}, resp ${respiratory}`,
  };
}
