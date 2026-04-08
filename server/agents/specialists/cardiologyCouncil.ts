/**
 * cardiologyCouncil.ts
 * Cardiology specialist sub-council.
 *
 * Runs internal debate among cardiology-domain agents then produces a
 * specialty-specific risk assessment and treatment recommendation.
 * Activated when the master council detects chest pain, palpitations,
 * syncope, or other cardiac presentations.
 */

import { debateEngine }    from "../debateEngine";
import { consensusEngine } from "../consensusEngine";
import type { AgentOutput } from "../debateEngine";

export interface CardiologyInput {
  symptoms:        string[];
  answers:         Record<string, any>;
  differentials?:  { diagnosis: string; score: number }[];
  vitals?:         Record<string, any>;
  riskScore?:      number;
}

export interface CardiologyOutput {
  specialty:        "cardiology";
  riskLevel:        "low" | "moderate" | "high" | "critical";
  heartScore?:      number;
  timitScore?:      number;
  recommendation:   string;
  urgency:          "routine" | "urgent" | "emergent";
  debate:           any[];
  consensus:        any;
  confidence:       number;
}

async function heartScoreAgent(input: CardiologyInput): Promise<AgentOutput> {
  const answers = input.answers ?? {};
  const vitals  = input.vitals ?? {};

  let score = 0;

  const hasChestPain = input.symptoms.some((s) => /chest\s*pain/i.test(s));
  if (hasChestPain) score += 2;

  if (answers.diaphoresis || answers.sweating) score += 1;
  if (answers.ecgAbnormal || answers.stChange) score += 2;
  if (answers.troponinElevated) score += 2;

  const age = Number(answers.age ?? vitals.age ?? 50);
  if (age >= 65) score += 2;
  else if (age >= 45) score += 1;

  const risk = score >= 7 ? 0.9 : score >= 4 ? 0.6 : 0.2;

  return {
    agent:      "heart_score",
    confidence: risk,
    result:     { heartScore: score, risk },
    reasoning:  `HEART score: ${score} → risk ${(risk * 100).toFixed(0)}%`,
  };
}

async function acsPathwayAgent(input: CardiologyInput): Promise<AgentOutput> {
  const answers = input.answers ?? {};

  const acsFactors: string[] = [];
  if (answers.radiatingToArm) acsFactors.push("arm_radiation");
  if (answers.nausea && answers.chestPain) acsFactors.push("nausea_with_pain");
  if (answers.diaphoresis) acsFactors.push("diaphoresis");
  if (answers.priorMI) acsFactors.push("prior_mi");

  const confidence = acsFactors.length >= 2 ? 0.75 : acsFactors.length === 1 ? 0.45 : 0.15;

  return {
    agent:      "acs_pathway",
    confidence,
    result:     { acsFactors, acsSuspicion: confidence },
    reasoning:  `ACS pathway: ${acsFactors.length} factors (${acsFactors.join(", ")})`,
  };
}

async function cardiacRiskAgent(input: CardiologyInput): Promise<AgentOutput> {
  const answers = input.answers ?? {};
  let  riskCount = 0;

  if (answers.diabetes)           riskCount++;
  if (answers.hypertension)       riskCount++;
  if (answers.hyperlipidemia)     riskCount++;
  if (answers.smoking)            riskCount++;
  if (answers.familyHistoryCAD)   riskCount++;
  if (answers.obesity)            riskCount++;

  const confidence = Math.min(1, riskCount * 0.15 + 0.1);

  return {
    agent:      "cardiac_risk_factors",
    confidence,
    result:     { riskFactorCount: riskCount, confidence },
    reasoning:  `${riskCount} Framingham risk factors present`,
  };
}

export async function runCardiologyCouncil(input: CardiologyInput): Promise<CardiologyOutput> {
  let outputs = await Promise.all([
    heartScoreAgent(input),
    acsPathwayAgent(input),
    cardiacRiskAgent(input),
  ]);

  const critiques = debateEngine.generateCritiques(outputs);
  outputs         = debateEngine.apply(critiques, outputs);
  const consensus = consensusEngine.compute(outputs);

  const heartAgent = outputs.find((o) => o.agent === "heart_score");
  const heartScore = heartAgent?.result?.heartScore ?? 0;

  const riskLevel: CardiologyOutput["riskLevel"] =
    consensus.weightedRisk >= 0.85 ? "critical" :
    consensus.weightedRisk >= 0.65 ? "high"     :
    consensus.weightedRisk >= 0.35 ? "moderate" : "low";

  const urgency: CardiologyOutput["urgency"] =
    riskLevel === "critical" ? "emergent" :
    riskLevel === "high"     ? "urgent"   : "routine";

  const recommendation =
    riskLevel === "critical" ? "Immediate cardiac catheterisation / PCI workup" :
    riskLevel === "high"     ? "12-lead ECG + serial troponins + cardiology consult" :
    riskLevel === "moderate" ? "Troponin x2, rest ECG, risk stratification" :
                               "Outpatient risk stratification appropriate";

  return {
    specialty:       "cardiology",
    riskLevel,
    heartScore,
    recommendation,
    urgency,
    debate:          critiques,
    consensus,
    confidence:      consensus.avgConfidence,
  };
}
