export interface ClinicalFeatures {
  age: number;
  sbp: number;
  dbp: number;
  spo2: number;
  hr: number;
  rr: number;
  temp: number;
  chestPain: number;
  sob: number;
  diaphoresis: number;
  confusion: number;
  fever: number;
  immunocompromised: number;
  ageOver65: number;
  ageOver80: number;
}

export interface RawInput {
  ageYears?: number;
  complaint?: string;
  symptoms?: string;
  vitals?: {
    systolicBp?: number;
    diastolicBp?: number;
    oxygenSaturation?: number;
    heartRate?: number;
    respiratoryRate?: number;
    temperature?: number;
  };
  history?: string;
}

export function buildFeatures(input: RawInput): ClinicalFeatures {
  const text = `${input.complaint ?? ""} ${input.symptoms ?? ""} ${input.history ?? ""}`.toLowerCase();

  const age = input.ageYears ?? 0;
  const vitals = input.vitals ?? {};

  return {
    age,
    sbp:              vitals.systolicBp        ?? 120,
    dbp:              vitals.diastolicBp        ?? 80,
    spo2:             vitals.oxygenSaturation   ?? 98,
    hr:               vitals.heartRate          ?? 80,
    rr:               vitals.respiratoryRate    ?? 16,
    temp:             vitals.temperature        ?? 98.6,

    chestPain:        /chest.?pain|chest.*pressure|chest.*tight/.test(text) ? 1 : 0,
    sob:              /shortness.*breath|dyspnea|can.?t breathe|difficulty breathing/.test(text) ? 1 : 0,
    diaphoresis:      /sweat|diaphor/.test(text) ? 1 : 0,
    confusion:        /confusion|confused|altered mental|disoriented|lethargy/.test(text) ? 1 : 0,
    fever:            /fever|febrile/.test(text) || (vitals.temperature ?? 0) > 100.4 ? 1 : 0,
    immunocompromised:/immunocompromised|hiv|chemo|transplant|immunosuppressed/.test(text) ? 1 : 0,

    ageOver65: age > 65 ? 1 : 0,
    ageOver80: age > 80 ? 1 : 0,
  };
}

export function normalizeFeatures(f: ClinicalFeatures): Record<string, number> {
  return {
    age:              f.age / 100,
    sbp:              (f.sbp - 120) / 40,
    dbp:              (f.dbp - 80)  / 20,
    spo2:             (f.spo2 - 98) / 5,
    hr:               (f.hr  - 80)  / 40,
    rr:               (f.rr  - 16)  / 8,
    temp:             (f.temp - 98.6) / 2,
    chestPain:        f.chestPain,
    sob:              f.sob,
    diaphoresis:      f.diaphoresis,
    confusion:        f.confusion,
    fever:            f.fever,
    immunocompromised:f.immunocompromised,
    ageOver65:        f.ageOver65,
    ageOver80:        f.ageOver80,
  };
}
