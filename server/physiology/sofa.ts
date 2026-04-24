/**
 * server/physiology/sofa.ts
 * Sequential Organ Failure Assessment (SOFA) score
 * Uses SpO₂ proxy for PaO₂/FiO₂ when arterial gas unavailable.
 */

export interface Labs {
  platelets?:  number;   // x10³/µL
  bilirubin?:  number;   // mg/dL
  creatinine?: number;   // mg/dL
  gcs?:        number;   // 3–15
}

export interface Vitals {
  map?:          number;   // mmHg
  spo2?:         number;   // %
  fio2?:         number;   // 0–1 (optional, future)
  onVent?:       boolean;
  vasopressors?: boolean;
}

function scoreResp(spo2?: number, onVent?: boolean): number {
  if (spo2 == null) return 0;
  if (spo2 >= 95) return 0;
  if (spo2 >= 90) return 1;
  if (spo2 >= 85) return 2;
  if (spo2 >= 80) return onVent ? 4 : 3;
  return 4;
}

function scoreCoag(platelets?: number): number {
  if (platelets == null) return 0;
  if (platelets >= 150) return 0;
  if (platelets >= 100) return 1;
  if (platelets >= 50)  return 2;
  if (platelets >= 20)  return 3;
  return 4;
}

function scoreLiver(bilirubin?: number): number {
  if (bilirubin == null) return 0;
  if (bilirubin <  1.2) return 0;
  if (bilirubin <  2.0) return 1;
  if (bilirubin <  6.0) return 2;
  if (bilirubin < 12.0) return 3;
  return 4;
}

function scoreCV(map?: number, vasopressors?: boolean): number {
  if (vasopressors) return 3;
  if (map == null) return 0;
  return map >= 70 ? 0 : 1;
}

function scoreCNS(gcs?: number): number {
  if (gcs == null) return 0;
  if (gcs === 15) return 0;
  if (gcs >= 13)  return 1;
  if (gcs >= 10)  return 2;
  if (gcs >= 6)   return 3;
  return 4;
}

function scoreRenal(creatinine?: number): number {
  if (creatinine == null) return 0;
  if (creatinine < 1.2) return 0;
  if (creatinine < 2.0) return 1;
  if (creatinine < 3.5) return 2;
  if (creatinine < 5.0) return 3;
  return 4;
}

export interface SOFAResult {
  total: number;
  components: {
    resp:   number;
    coag:   number;
    liver:  number;
    cv:     number;
    cns:    number;
    renal:  number;
  };
}

export function computeSOFA(v: Vitals, l: Labs): SOFAResult {
  const components = {
    resp:  scoreResp(v.spo2, v.onVent),
    coag:  scoreCoag(l.platelets),
    liver: scoreLiver(l.bilirubin),
    cv:    scoreCV(v.map, v.vasopressors),
    cns:   scoreCNS(l.gcs),
    renal: scoreRenal(l.creatinine),
  };
  const total =
    components.resp + components.coag + components.liver +
    components.cv   + components.cns  + components.renal;
  return { total, components };
}
