/**
 * Sepsis Detection — qSOFA + NEWS2
 *
 * qSOFA (quick Sepsis-Related Organ Failure Assessment):
 *   - Respiratory rate ≥ 22 breaths/min     → 1 point
 *   - Altered mental status (GCS < 15)       → 1 point
 *   - Systolic BP ≤ 100 mmHg                 → 1 point
 *   Score ≥ 2 = HIGH RISK of sepsis mortality (ER_NOW)
 *
 * NEWS2 (National Early Warning Score 2):
 *   Full 7-parameter vital-sign scoring including SpO2, supplemental O2,
 *   consciousness (ACVPU), BP, RR, HR, temperature.
 *   Score ≥ 7 = urgent review / escalation.
 *
 * References:
 *   - Singer et al., JAMA 2016 (Sepsis-3 / qSOFA)
 *   - Royal College of Physicians, NEWS2 2017
 */

export interface VitalSigns {
  respiratoryRate?:      number;   // breaths/min
  systolicBP?:           number;   // mmHg
  heartRate?:            number;   // bpm
  temperature?:          number;   // °C
  spo2?:                 number;   // %
  supplementalO2?:       boolean;  // on supplemental O2?
  alteredMentalStatus?:  boolean;  // GCS < 15 or ACVPU ≠ A
  gcs?:                  number;   // 3–15
}

export interface QsofaResult {
  score:            number;
  highRisk:         boolean;
  criteria: {
    tachypnea:      boolean;
    alteredMental:  boolean;
    hypotension:    boolean;
  };
  disposition:      "ER_NOW" | "MONITOR";
  rationale:        string;
}

export interface News2Result {
  score:       number;
  riskLevel:   "low" | "low-medium" | "medium" | "high";
  escalate:    boolean;
  breakdown: {
    rr:    number;
    spo2:  number;
    o2:    number;
    sbp:   number;
    hr:    number;
    temp:  number;
    avpu:  number;
  };
}

export interface SepsisScreenResult {
  qsofa:       QsofaResult;
  news2?:      News2Result;
  highRisk:    boolean;
  disposition: "ER_NOW" | "URGENT_24H" | "MONITOR";
  confidence:  number;
}

// ── qSOFA ────────────────────────────────────────────────────────────────────

export function qSOFA(vitals: VitalSigns): QsofaResult {
  const tachypnea    = (vitals.respiratoryRate ?? 0) >= 22;
  const alteredMental = vitals.alteredMentalStatus === true || (vitals.gcs !== undefined && vitals.gcs < 15);
  const hypotension  = (vitals.systolicBP ?? 999) <= 100;

  const score = [tachypnea, alteredMental, hypotension].filter(Boolean).length;
  const highRisk = score >= 2;

  const criteria: string[] = [];
  if (tachypnea)     criteria.push(`RR ${vitals.respiratoryRate} ≥ 22`);
  if (alteredMental) criteria.push("Altered mental status");
  if (hypotension)   criteria.push(`SBP ${vitals.systolicBP} ≤ 100`);

  return {
    score,
    highRisk,
    criteria: { tachypnea, alteredMental, hypotension },
    disposition: highRisk ? "ER_NOW" : "MONITOR",
    rationale: highRisk
      ? `qSOFA ${score}/3 — sepsis high-risk: ${criteria.join(", ")}`
      : `qSOFA ${score}/3 — sepsis low-risk at this time`,
  };
}

// ── NEWS2 ─────────────────────────────────────────────────────────────────────

function news2RrScore(rr?: number): number {
  if (rr === undefined) return 0;
  if (rr <= 8)  return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function news2Spo2Score(spo2?: number, supplemental?: boolean): number {
  if (spo2 === undefined) return 0;
  if (supplemental) {
    if (spo2 >= 97) return 3;
    if (spo2 >= 95) return 2;
    if (spo2 >= 93) return 1;
    return 0;
  }
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function news2SbpScore(sbp?: number): number {
  if (sbp === undefined) return 0;
  if (sbp <= 90)  return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

function news2HrScore(hr?: number): number {
  if (hr === undefined) return 0;
  if (hr <= 40)  return 3;
  if (hr <= 50)  return 1;
  if (hr <= 90)  return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3;
}

function news2TempScore(temp?: number): number {
  if (temp === undefined) return 0;
  if (temp <= 35.0) return 3;
  if (temp <= 36.0) return 1;
  if (temp <= 38.0) return 0;
  if (temp <= 39.0) return 1;
  return 2;
}

export function news2(vitals: VitalSigns): News2Result {
  const rr   = news2RrScore(vitals.respiratoryRate);
  const spo2 = news2Spo2Score(vitals.spo2, vitals.supplementalO2);
  const o2   = vitals.supplementalO2 ? 2 : 0;
  const sbp  = news2SbpScore(vitals.systolicBP);
  const hr   = news2HrScore(vitals.heartRate);
  const temp = news2TempScore(vitals.temperature);
  const avpu = vitals.alteredMentalStatus ? 3 : 0;

  const score = rr + spo2 + o2 + sbp + hr + temp + avpu;
  const riskLevel = score <= 4 ? "low" : score <= 6 ? "low-medium" : score <= 8 ? "medium" : "high";

  return { score, riskLevel, escalate: score >= 7, breakdown: { rr, spo2, o2, sbp, hr, temp, avpu } };
}

// ── Combined Sepsis Screen ────────────────────────────────────────────────────

export function detectSepsis(vitals: VitalSigns): SepsisScreenResult {
  const qsofa  = qSOFA(vitals);
  const news2r = news2(vitals);

  const highRisk   = qsofa.highRisk || news2r.escalate;
  const confidence = qsofa.score / 3;

  return {
    qsofa,
    news2: news2r,
    highRisk,
    disposition: highRisk ? "ER_NOW" : qsofa.score >= 1 ? "URGENT_24H" : "MONITOR",
    confidence,
  };
}
