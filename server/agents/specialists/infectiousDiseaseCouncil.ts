/**
 * infectiousDiseaseCouncil.ts
 * Infectious disease specialist sub-council.
 *
 * Activated when the master council detects fever, sepsis risk, known
 * infectious presentations (pneumonia, UTI, cellulitis, meningitis, etc.)
 */

import { debateEngine }    from "../debateEngine";
import { consensusEngine } from "../consensusEngine";
import type { AgentOutput } from "../debateEngine";

export interface InfectiousDiseaseInput {
  symptoms:       string[];
  answers:        Record<string, any>;
  vitals?:        Record<string, any>;
  differentials?: { diagnosis: string; score: number }[];
}

export interface InfectiousDiseaseOutput {
  specialty:       "infectious_disease";
  sepsisRisk:      "none" | "possible" | "probable" | "high";
  qsofaScore:      number;
  sirsCount:       number;
  recommendation:  string;
  urgency:         "routine" | "urgent" | "emergent";
  isolationNeeded: boolean;
  debate:          any[];
  consensus:       any;
  confidence:      number;
}

async function sepsisScreenAgent(input: InfectiousDiseaseInput): Promise<AgentOutput> {
  const a = input.answers ?? {};
  const v = input.vitals  ?? {};

  let qsofa = 0;
  const rr  = Number(v.respiratoryRate ?? a.respiratoryRate ?? 16);
  const sbp = Number(v.systolicBP      ?? a.systolicBP      ?? 120);
  const gcs = Number(v.gcs             ?? a.alteredMental   ? 13 : 15);

  if (rr >= 22) qsofa++;
  if (sbp <= 100) qsofa++;
  if (gcs < 15)   qsofa++;

  let sirs = 0;
  const temp = Number(v.temperature ?? a.temperature ?? 37);
  const hr   = Number(v.heartRate   ?? a.heartRate   ?? 80);
  if (temp > 38 || temp < 36)  sirs++;
  if (hr > 90)                  sirs++;
  if (rr > 20)                  sirs++;
  if (a.wbcElevated || a.wbcLow) sirs++;

  const confidence =
    qsofa >= 2 ? 0.85 : qsofa === 1 ? 0.5 : sirs >= 2 ? 0.35 : 0.1;

  return {
    agent:      "sepsis_screen",
    confidence,
    result:     { qsofa, sirs, confidence },
    reasoning:  `qSOFA: ${qsofa}/3 | SIRS: ${sirs}/4`,
  };
}

async function infectiousSourceAgent(input: InfectiousDiseaseInput): Promise<AgentOutput> {
  const a      = input.answers ?? {};
  const syms   = input.symptoms.join(" ").toLowerCase();

  const sources: string[] = [];
  if (/pneumonia|cough|sputum|pleuritic/i.test(syms) || a.cough) sources.push("respiratory");
  if (/dysuria|frequency|flank\s*pain/i.test(syms) || a.dysuria)  sources.push("urinary");
  if (/cellulitis|wound|erythema/i.test(syms) || a.woundInfection) sources.push("skin");
  if (/neck\s*stiff|headache|photophobia/i.test(syms))             sources.push("cns");
  if (/diarrhea|gastro/i.test(syms) || a.diarrhea)                 sources.push("gi");

  const confidence = sources.length > 0 ? Math.min(0.9, sources.length * 0.25 + 0.3) : 0.1;

  return {
    agent:      "infectious_source",
    confidence,
    result:     { identifiedSources: sources },
    reasoning:  `Likely infectious sources: ${sources.join(", ") || "undetermined"}`,
  };
}

async function resistanceRiskAgent(input: InfectiousDiseaseInput): Promise<AgentOutput> {
  const a = input.answers ?? {};
  let risk = 0;

  if (a.recentAntibiotics)    risk++;
  if (a.hospitalisation180d)  risk++;
  if (a.nursingHomeresident)  risk++;
  if (a.immunocompromised)    risk++;
  if (a.priorMDRO)            risk++;

  const confidence = Math.min(1, risk * 0.2 + 0.05);

  return {
    agent:      "resistance_risk",
    confidence,
    result:     { resistanceRiskScore: risk, factors: risk },
    reasoning:  `MDRO risk factors: ${risk}`,
  };
}

export async function runInfectiousDiseaseCouncil(
  input: InfectiousDiseaseInput,
): Promise<InfectiousDiseaseOutput> {
  let outputs = await Promise.all([
    sepsisScreenAgent(input),
    infectiousSourceAgent(input),
    resistanceRiskAgent(input),
  ]);

  const critiques = debateEngine.generateCritiques(outputs);
  outputs         = debateEngine.apply(critiques, outputs);
  const consensus = consensusEngine.compute(outputs);

  const sepsisAgent = outputs.find((o) => o.agent === "sepsis_screen");
  const qsofa       = sepsisAgent?.result?.qsofa ?? 0;
  const sirs        = sepsisAgent?.result?.sirs  ?? 0;

  const sepsisRisk: InfectiousDiseaseOutput["sepsisRisk"] =
    qsofa >= 2 ? "high"     :
    qsofa === 1 ? "probable" :
    sirs >= 2  ? "possible" : "none";

  const urgency: InfectiousDiseaseOutput["urgency"] =
    sepsisRisk === "high" ? "emergent" :
    sepsisRisk === "probable" ? "urgent" : "routine";

  const recommendation =
    sepsisRisk === "high"     ? "Sepsis bundle: lactate, blood cultures x2, IV access, early antibiotics within 1h, fluid resuscitation" :
    sepsisRisk === "probable" ? "Blood cultures, IV antibiotics, reassess in 1h, consider ICU consultation" :
    sepsisRisk === "possible" ? "Source control, oral antibiotics, close follow-up in 24–48h" :
                                "Targeted antimicrobial therapy based on identified source";

  const resistanceAgent  = outputs.find((o) => o.agent === "resistance_risk");
  const isolationNeeded  = (resistanceAgent?.result?.resistanceRiskScore ?? 0) >= 3;

  return {
    specialty:      "infectious_disease",
    sepsisRisk,
    qsofaScore:     qsofa,
    sirsCount:      sirs,
    recommendation,
    urgency,
    isolationNeeded,
    debate:         critiques,
    consensus,
    confidence:     consensus.avgConfidence,
  };
}
