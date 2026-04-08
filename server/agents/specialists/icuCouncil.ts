/**
 * icuCouncil.ts
 * ICU specialist sub-council.
 *
 * Activated when the master council's composite risk score exceeds 0.80,
 * or when cardiology/ID councils return critical/emergent recommendations.
 *
 * Runs three ICU-domain agents:
 *   1. SeverityScoreAgent  — APACHE II / SOFA proxy scoring
 *   2. OrganFailureAgent   — multi-organ dysfunction screen
 *   3. VentilationRiskAgent — airway/respiratory compromise assessment
 */

import { debateEngine }    from "../debateEngine";
import { consensusEngine } from "../consensusEngine";
import type { AgentOutput } from "../debateEngine";

export interface ICUInput {
  symptoms:    string[];
  answers:     Record<string, any>;
  vitals?:     Record<string, any>;
  riskScore?:  number;
  sepsisRisk?: string;
}

export interface ICUOutput {
  specialty:          "icu";
  icuAdmissionRisk:   "low" | "moderate" | "high" | "immediate";
  sofahProxy:         number;
  organSystemsAtRisk: string[];
  ventilationRisk:    "none" | "possible" | "likely";
  recommendation:     string;
  urgency:            "routine" | "urgent" | "emergent";
  debate:             any[];
  consensus:          any;
  confidence:         number;
}

async function severityScoreAgent(input: ICUInput): Promise<AgentOutput> {
  const v     = input.vitals  ?? {};
  const a     = input.answers ?? {};

  let sofa = 0;

  const sbp  = Number(v.systolicBP ?? a.systolicBP ?? 120);
  const spo2 = Number(v.spo2      ?? a.oxygenSaturation ?? 98);
  const hr   = Number(v.heartRate ?? a.heartRate ?? 80);
  const gcs  = Number(v.gcs      ?? (a.alteredMental ? 12 : 15));

  if (sbp < 70)          sofa += 4;
  else if (sbp < 90)     sofa += 2;
  if (spo2 < 90)         sofa += 3;
  else if (spo2 < 94)    sofa += 1;
  if (hr > 130)          sofa += 1;
  if (gcs < 10)          sofa += 3;
  else if (gcs < 13)     sofa += 1;
  if (a.creatinineHigh)  sofa += 2;
  if (a.bilirubinHigh)   sofa += 1;
  if (a.plateletLow)     sofa += 1;

  const confidence = sofa >= 8 ? 0.92 : sofa >= 4 ? 0.65 : 0.2;

  return {
    agent:      "severity_score",
    confidence,
    result:     { sofaProxy: sofa, confidence },
    reasoning:  `SOFA proxy: ${sofa}/15`,
  };
}

async function organFailureAgent(input: ICUInput): Promise<AgentOutput> {
  const a = input.answers ?? {};
  const v = input.vitals  ?? {};

  const systems: string[] = [];

  const spo2 = Number(v.spo2 ?? a.oxygenSaturation ?? 98);
  const sbp  = Number(v.systolicBP ?? a.systolicBP ?? 120);

  if (spo2 < 90 || a.respiratoryFailure) systems.push("respiratory");
  if (sbp < 90 || a.vasoprressorRequired) systems.push("cardiovascular");
  if (a.creatinineHigh || a.anuria || a.oliguria) systems.push("renal");
  if (a.bilirubinHigh || a.jaundice) systems.push("hepatic");
  if (a.alteredMental || (Number(v.gcs ?? 15)) < 13) systems.push("neurological");
  if (a.plateletLow || a.coagulopathy) systems.push("hematologic");

  const confidence = Math.min(1, systems.length * 0.2 + 0.05);

  return {
    agent:      "organ_failure",
    confidence,
    result:     { organSystemsAtRisk: systems, count: systems.length },
    reasoning:  `${systems.length} organ system(s) at risk: ${systems.join(", ")}`,
  };
}

async function ventilationRiskAgent(input: ICUInput): Promise<AgentOutput> {
  const a    = input.answers ?? {};
  const v    = input.vitals  ?? {};
  const syms = input.symptoms.join(" ").toLowerCase();

  let vent = 0;

  const spo2 = Number(v.spo2 ?? a.oxygenSaturation ?? 98);
  const rr   = Number(v.respiratoryRate ?? a.respiratoryRate ?? 16);

  if (spo2 < 90)  vent += 3;
  else if (spo2 < 94) vent += 1;
  if (rr > 30)    vent += 2;
  if (/stridor|wheeze|airway/i.test(syms)) vent += 2;
  if (a.alteredMental) vent += 1;
  if (a.cyanosis) vent += 3;

  const risk: ICUOutput["ventilationRisk"] =
    vent >= 5 ? "likely" : vent >= 2 ? "possible" : "none";
  const confidence = vent >= 5 ? 0.88 : vent >= 2 ? 0.55 : 0.05;

  return {
    agent:      "ventilation_risk",
    confidence,
    result:     { ventScore: vent, risk },
    reasoning:  `Ventilation risk score: ${vent} → ${risk}`,
  };
}

export async function runICUCouncil(input: ICUInput): Promise<ICUOutput> {
  let outputs = await Promise.all([
    severityScoreAgent(input),
    organFailureAgent(input),
    ventilationRiskAgent(input),
  ]);

  const critiques  = debateEngine.generateCritiques(outputs);
  outputs          = debateEngine.apply(critiques, outputs);
  const consensus  = consensusEngine.compute(outputs);

  const orgAgent   = outputs.find((o) => o.agent === "organ_failure");
  const ventAgent  = outputs.find((o) => o.agent === "ventilation_risk");
  const sevAgent   = outputs.find((o) => o.agent === "severity_score");

  const organSystems    = orgAgent?.result?.organSystemsAtRisk  ?? [];
  const ventilationRisk = ventAgent?.result?.risk               ?? "none";
  const sofaProxy       = sevAgent?.result?.sofaProxy           ?? 0;

  const icuRisk: ICUOutput["icuAdmissionRisk"] =
    consensus.weightedRisk >= 0.85 ? "immediate" :
    consensus.weightedRisk >= 0.65 ? "high"      :
    consensus.weightedRisk >= 0.35 ? "moderate"  : "low";

  const urgency: ICUOutput["urgency"] =
    icuRisk === "immediate" ? "emergent" :
    icuRisk === "high"      ? "urgent"   : "routine";

  const recommendation =
    icuRisk === "immediate" ? "Immediate ICU admission + multi-disciplinary rapid response" :
    icuRisk === "high"      ? "ICU consultation, continuous monitoring, vasopressor access" :
    icuRisk === "moderate"  ? "Step-down unit, 4-hourly observations, early warning scoring" :
                              "Ward-level care with regular reassessment";

  return {
    specialty:           "icu",
    icuAdmissionRisk:    icuRisk,
    sofahProxy:          sofaProxy,
    organSystemsAtRisk:  organSystems,
    ventilationRisk,
    recommendation,
    urgency,
    debate:              critiques,
    consensus,
    confidence:          consensus.avgConfidence,
  };
}
