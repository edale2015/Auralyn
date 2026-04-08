import type { AgentInput, AgentOutput } from "./types";
import { BaseCouncil } from "./baseCouncil";
import { AgentGraphAdapter } from "../../reasoning/agentGraphAdapter";
import { buildInfectiousDiseaseGraph } from "../../reasoning/specialistGraphs";
import { clamp, dedupeStrings, hasAny, vitalsRisk } from "./utils";

async function infectiousDiagnosisAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const hypotheses: string[] = [];
  let risk = 0.1 + vitalsRisk(p) * 0.5;

  if (hasAny(p.symptoms, "fever") || (p.vitals?.temp ?? 37) > 38.3) {
    hypotheses.push("infection");
    risk += 0.2;
  }
  if (p.tests?.infiltrateOnCxr || p.exam?.cough) {
    hypotheses.push("pneumonia");
    risk += 0.15;
  }
  if (p.exam?.dysuria || p.tests?.urineNitritePositive) {
    hypotheses.push("uti_or_pyelo");
    risk += 0.1;
  }
  if ((p.labs?.lactate ?? 0) > 2 || (p.vitals?.systolic ?? 120) < 90) {
    hypotheses.push("sepsis");
    risk += 0.35;
  }

  return {
    council: "infectious_disease",
    agent: "id_diagnosis",
    confidence: clamp(0.55 + (hypotheses.length * 0.08)),
    result: {
      risk: clamp(risk),
      hypotheses,
      recommendedTests: dedupeStrings([
        "CBC", "CMP", "Blood cultures",
        p.exam?.dysuria ? "Urinalysis" : "",
        p.tests?.infiltrateOnCxr ? "Sputum culture" : "",
      ]),
    },
    reasoning: "Synthesizes fever, source clues, lactate, and hypotension.",
  };
}

async function infectiousSeverityAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  let risk = 0;
  if ((p.vitals?.systolic ?? 120) < 90) risk += 0.35;
  if ((p.vitals?.hr ?? 80) > 120) risk += 0.15;
  if ((p.vitals?.temp ?? 37) > 39) risk += 0.1;
  if ((p.labs?.lactate ?? 0) > 2) risk += 0.25;
  if (p.exam?.alteredMentalStatus) risk += 0.2;

  return {
    council: "infectious_disease",
    agent: "id_severity",
    confidence: 0.82,
    result: {
      risk: clamp(risk),
      recommendation: risk >= 0.7 ? "treat_as_possible_sepsis" : "source_directed_workup",
    },
    reasoning: "Approximates infection severity from shock and organ dysfunction markers.",
    flags: risk >= 0.7 ? ["critical"] : [],
  };
}

async function antibioticAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const source =
    p.tests?.infiltrateOnCxr ? "pulmonary" :
    p.tests?.urineNitritePositive || p.exam?.dysuria ? "urinary" :
    "undifferentiated";
  const allergy = (p.allergies || []).map(a => a.toLowerCase());
  const regimen =
    allergy.includes("penicillin")
      ? (source === "pulmonary" ? "aztreonam_plus_levofloxacin" : "aztreonam_based_coverage")
      : (source === "pulmonary" ? "ceftriaxone_plus_azithromycin" :
         source === "urinary" ? "ceftriaxone" : "vancomycin_plus_piperacillin_tazobactam");

  return {
    council: "infectious_disease",
    agent: "id_antibiotics",
    confidence: 0.76,
    result: {
      risk: source === "undifferentiated" ? 0.55 : 0.45,
      recommendation: `start_${regimen}`,
      recommendedTests: ["Blood cultures before antibiotics if no delay", "Lactate"],
      source,
    },
    reasoning: "Chooses empiric coverage from likely source and allergy constraints.",
    flags: ["safe-plan"],
  };
}

async function infectiousSafetyAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const flags: string[] = [];
  if ((p.vitals?.systolic ?? 120) < 90) flags.push("critical");
  if ((p.labs?.lactate ?? 0) > 4) flags.push("critical");
  if (p.allergies?.length) flags.push("medication-allergy-check");

  return {
    council: "infectious_disease",
    agent: "id_safety",
    confidence: 0.88,
    result: {
      risk: flags.includes("critical") ? 0.85 : 0.25,
      recommendation: flags.includes("critical")
        ? "sepsis_bundle_now"
        : "careful_antibiotic_selection",
    },
    reasoning: "Prevents missed sepsis and allergy-blind antibiotic selection.",
    flags,
  };
}

const graphAdapter = new AgentGraphAdapter(
  buildInfectiousDiseaseGraph(),
  (ctx) => [(hasAny(ctx.symptoms, "fever") || (ctx.vitals?.temp ?? 37) > 38.3)
    ? "symptom:fever"
    : "symptom:fever"],
);

export class InfectiousDiseaseGraphCouncil extends BaseCouncil {
  constructor() {
    super("infectious_disease", [
      infectiousDiagnosisAgent,
      infectiousSeverityAgent,
      antibioticAgent,
      infectiousSafetyAgent,
    ], graphAdapter);
  }

  protected finalize(consensus: any, outputs: AgentOutput[]): Record<string, unknown> {
    const tests = outputs.flatMap(o =>
      Array.isArray(o.result.recommendedTests) ? o.result.recommendedTests as string[] : [],
    );
    return {
      specialty: "infectious_disease",
      action: consensus.risk >= 0.7 ? "admit_or_escalate_sepsis_path" : "source_directed_management",
      recommendation: consensus.recommendation,
      urgency: consensus.urgency,
      recommendedTests: dedupeStrings(tests),
    };
  }
}

export const infectiousDiseaseGraphCouncil = new InfectiousDiseaseGraphCouncil();
