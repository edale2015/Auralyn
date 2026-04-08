import type { AgentInput, AgentOutput } from "./types";
import { BaseCouncil } from "./baseCouncil";
import { AgentGraphAdapter } from "../../reasoning/agentGraphAdapter";
import { buildCardiologyGraph } from "../../reasoning/specialistGraphs";
import { clamp, dedupeStrings, hasAny, vitalsRisk } from "./utils";

async function cardiologyDiagnosisAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  let risk = 0.15 + vitalsRisk(p) * 0.4;
  const hypotheses: string[] = [];

  if (p.exam?.chestPain || hasAny(p.symptoms, "chest pain", "pressure")) {
    hypotheses.push("acute_coronary_syndrome");
    risk += 0.25;
  }
  if (p.tests?.ecgStElevation) {
    hypotheses.push("stemi");
    risk += 0.35;
  }
  if ((p.labs?.troponin ?? 0) > 0.04) {
    hypotheses.push("nsti_or_myocardial_injury");
    risk += 0.2;
  }
  if (p.exam?.dyspnea) {
    hypotheses.push("heart_failure_or_pe");
    risk += 0.05;
  }

  return {
    council: "cardiology",
    agent: "cardiology_diagnosis",
    confidence: clamp(0.55 + (hypotheses.length * 0.08)),
    result: {
      risk: clamp(risk),
      hypotheses,
      recommendedTests: dedupeStrings([
        "ECG",
        "Troponin",
        "BMP",
        p.exam?.dyspnea ? "Chest X-ray" : "",
      ]),
    },
    reasoning: "Combines chest pain pattern, ECG, troponin, and dyspnea signals.",
  };
}

async function cardiologyRiskAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  let risk = vitalsRisk(p) * 0.6;

  if (p.tests?.ecgStElevation) risk += 0.45;
  if ((p.labs?.troponin ?? 0) > 0.04) risk += 0.25;
  if (p.riskFactors?.some(r => ["cad", "diabetes", "smoker"].includes(r.toLowerCase()))) risk += 0.1;

  const flags: string[] = [];
  if ((p.vitals?.systolic ?? 120) < 90) flags.push("critical");
  if ((p.vitals?.spo2 ?? 100) < 90) flags.push("critical");

  return {
    council: "cardiology",
    agent: "cardiology_risk",
    confidence: clamp(0.7 + (p.tests?.ecgStElevation ? 0.15 : 0)),
    result: {
      risk: clamp(risk),
      recommendation: risk > 0.7 ? "activate_acs_pathway" : "serial_workup",
    },
    reasoning: "Scores shock, ACS markers, and baseline cardiovascular risk.",
    flags,
  };
}

async function cardiologyTreatmentAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const actions = ["ECG now", "Serial troponins"];
  if (!p.allergies?.includes("aspirin") && (p.exam?.chestPain || p.tests?.ecgStElevation)) {
    actions.push("Aspirin unless contraindicated");
  }
  if ((p.vitals?.spo2 ?? 100) < 90) actions.push("Supplemental oxygen");
  if ((p.vitals?.systolic ?? 120) < 90) actions.push("Hemodynamic stabilization");
  const rec = p.tests?.ecgStElevation ? "emergent_cardiology_activation" : "acs_observation_protocol";

  return {
    council: "cardiology",
    agent: "cardiology_treatment",
    confidence: clamp(0.65 + (p.tests?.ecgStElevation ? 0.2 : 0)),
    result: {
      risk: p.tests?.ecgStElevation ? 0.85 : 0.45,
      recommendation: rec,
      recommendedTests: ["Repeat ECG", "Troponin trend"],
      actions,
    },
    reasoning: "Maps likely ACS severity to a cardiology care bundle.",
    flags: ["safe-plan"],
  };
}

async function cardiologySafetyAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const flags: string[] = [];
  if (p.tests?.ecgStElevation) flags.push("critical");
  if ((p.vitals?.systolic ?? 120) < 90) flags.push("critical");
  if ((p.vitals?.spo2 ?? 100) < 90) flags.push("critical");

  return {
    council: "cardiology",
    agent: "cardiology_safety",
    confidence: 0.9,
    result: {
      risk: flags.length ? 0.9 : 0.2,
      recommendation: flags.length
        ? "do_not_delay_emergency_escalation"
        : "continue_monitored_workup",
    },
    reasoning: "Guards against slow-roll management of likely unstable cardiac disease.",
    flags,
  };
}

const graphAdapter = new AgentGraphAdapter(
  buildCardiologyGraph(),
  (ctx) => [ctx.exam?.chestPain || hasAny(ctx.symptoms, "chest pain") ? "symptom:chest_pain" : "symptom:chest_pain"],
);

export class CardiologyGraphCouncil extends BaseCouncil {
  constructor() {
    super("cardiology", [
      cardiologyDiagnosisAgent,
      cardiologyRiskAgent,
      cardiologyTreatmentAgent,
      cardiologySafetyAgent,
    ], graphAdapter);
  }

  protected finalize(consensus: any, outputs: AgentOutput[]): Record<string, unknown> {
    const tests = outputs.flatMap(o =>
      Array.isArray(o.result.recommendedTests) ? o.result.recommendedTests as string[] : [],
    );
    const action = consensus.risk >= 0.75 ? "ed_cardiology" : "cardiology_workup";
    return {
      specialty: "cardiology",
      action,
      recommendation: consensus.recommendation,
      urgency: consensus.urgency,
      recommendedTests: dedupeStrings(tests),
    };
  }
}

export const cardiologyGraphCouncil = new CardiologyGraphCouncil();
