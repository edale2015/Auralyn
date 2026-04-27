/**
 * SOFA Score Calculator — Sequential Organ Failure Assessment
 *
 * Scoring reference: Vincent et al., 1996 / SCCM/ESICM consensus.
 * Each of 6 organ systems scored 0–4 (total 0–24).
 *
 * Clinical note: This is decision support. Scores must be reviewed by a physician.
 * PaO2/FiO2 ratio calculation requires both an ABG and the current FiO2.
 */

export interface SofaInputs {
  // Respiratory
  paO2?: number;             // mmHg (from ABG)
  fiO2?: number;             // fraction 0.21–1.0
  mechanicallyVentilated?: boolean;
  // Coagulation
  platelets?: number;        // ×10³/µL
  // Liver
  bilirubin?: number;        // mg/dL
  // Cardiovascular
  map?: number;              // mean arterial pressure, mmHg
  dobutamineDose?: number;   // µg/kg/min (>0 = vasoactive support)
  dopamineDose?: number;     // µg/kg/min
  epinephrineDose?: number;  // µg/kg/min
  norepinephrineDose?: number; // µg/kg/min
  // CNS
  gcs?: number;              // Glasgow Coma Scale 3–15
  // Renal
  creatinine?: number;       // mg/dL
  urineOutput24h?: number;   // mL/24h
}

export interface SofaComponentScores {
  respiratory: number;
  coagulation: number;
  liver: number;
  cardiovascular: number;
  cns: number;
  renal: number;
}

export interface SofaResult {
  components: SofaComponentScores;
  total: number;
  interpretation: "LOW_RISK" | "MODERATE" | "HIGH" | "CRITICAL";
  mortalityEstimate: string;
  pfRatio: number | null;
  flags: string[];
}

export function computePfRatio(paO2?: number, fiO2?: number): number | null {
  if (!paO2 || !fiO2 || fiO2 <= 0) return null;
  return Math.round((paO2 / fiO2) * 10) / 10;
}

export function scoreRespiratory(pfRatio: number | null, ventilated?: boolean): number {
  if (pfRatio === null) return 0;
  if (pfRatio < 100 && ventilated) return 4;
  if (pfRatio < 200 && ventilated) return 3;
  if (pfRatio < 300) return 2;
  if (pfRatio < 400) return 1;
  return 0;
}

export function scoreCoagulation(platelets?: number): number {
  if (!platelets) return 0;
  if (platelets < 20)  return 4;
  if (platelets < 50)  return 3;
  if (platelets < 100) return 2;
  if (platelets < 150) return 1;
  return 0;
}

export function scoreLiver(bilirubin?: number): number {
  if (!bilirubin) return 0;
  if (bilirubin >= 12.0) return 4;
  if (bilirubin >= 6.0)  return 3;
  if (bilirubin >= 2.0)  return 2;
  if (bilirubin >= 1.2)  return 1;
  return 0;
}

export function scoreCardiovascular(inputs: SofaInputs): number {
  const { map, dopamineDose, dobutamineDose, epinephrineDose, norepinephrineDose } = inputs;
  if ((epinephrineDose ?? 0) > 0.1 || (norepinephrineDose ?? 0) > 0.1) return 4;
  if ((epinephrineDose ?? 0) > 0   || (norepinephrineDose ?? 0) > 0)   return 3;
  if ((dopamineDose ?? 0) > 5      || (dobutamineDose ?? 0) > 0)        return 3;
  if ((dopamineDose ?? 0) > 0      || (map !== undefined && map < 70))  return 2;
  if (map !== undefined && map < 70) return 1;
  return 0;
}

export function scoreCns(gcs?: number): number {
  if (!gcs) return 0;
  if (gcs < 6)  return 4;
  if (gcs < 10) return 3;
  if (gcs < 13) return 2;
  if (gcs < 15) return 1;
  return 0;
}

export function scoreRenal(creatinine?: number, urineOutput24h?: number): number {
  if (urineOutput24h !== undefined) {
    if (urineOutput24h < 200) return 4;
    if (urineOutput24h < 500) return 3;
  }
  if (!creatinine) return 0;
  if (creatinine >= 5.0)  return 4;
  if (creatinine >= 3.5)  return 3;
  if (creatinine >= 2.0)  return 2;
  if (creatinine >= 1.2)  return 1;
  return 0;
}

function interpretSofa(total: number): SofaResult["interpretation"] {
  if (total >= 11) return "CRITICAL";
  if (total >= 7)  return "HIGH";
  if (total >= 3)  return "MODERATE";
  return "LOW_RISK";
}

function mortalityEstimate(total: number): string {
  if (total >= 11) return ">50% (ICU mortality if score >11)";
  if (total >= 7)  return "20–33%";
  if (total >= 3)  return "6–20%";
  return "<10%";
}

export function calculateSofa(inputs: SofaInputs): SofaResult {
  const pfRatio = computePfRatio(inputs.paO2, inputs.fiO2);
  const flags: string[] = [];

  const components: SofaComponentScores = {
    respiratory:    scoreRespiratory(pfRatio, inputs.mechanicallyVentilated),
    coagulation:    scoreCoagulation(inputs.platelets),
    liver:          scoreLiver(inputs.bilirubin),
    cardiovascular: scoreCardiovascular(inputs),
    cns:            scoreCns(inputs.gcs),
    renal:          scoreRenal(inputs.creatinine, inputs.urineOutput24h),
  };

  const total = Object.values(components).reduce((s, v) => s + v, 0);

  if (components.respiratory === 4) flags.push("Severe hypoxemic respiratory failure (P/F <100 on vent)");
  if (components.cardiovascular >= 3) flags.push("Vasopressor-dependent circulatory shock");
  if (components.renal >= 3) flags.push("Acute kidney injury — consider RRT");
  if (components.cns >= 3) flags.push("Altered consciousness — GCS <10");
  if (total >= 2) flags.push("SOFA ≥2 meets Sepsis-3 organ dysfunction criteria");
  if (inputs.platelets !== undefined && inputs.platelets < 50) flags.push("Severe thrombocytopenia — coagulopathy risk");

  return {
    components,
    total,
    interpretation: interpretSofa(total),
    mortalityEstimate: mortalityEstimate(total),
    pfRatio,
    flags,
  };
}
