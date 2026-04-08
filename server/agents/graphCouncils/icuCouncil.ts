import type { AgentInput, AgentOutput } from "./types";
import { BaseCouncil } from "./baseCouncil";
import { AgentGraphAdapter } from "../../reasoning/agentGraphAdapter";
import { buildICUGraph } from "../../reasoning/specialistGraphs";
import { clamp, dedupeStrings, vitalsRisk } from "./utils";

async function icuDeteriorationAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  let risk = vitalsRisk(p);
  if (p.exam?.alteredMentalStatus) risk += 0.15;
  if ((p.vitals?.rr ?? 16) > 28) risk += 0.1;
  if ((p.labs?.lactate ?? 0) > 2) risk += 0.15;

  return {
    council: "icu",
    agent: "icu_deterioration",
    confidence: 0.84,
    result: {
      risk: clamp(risk),
      recommendation: risk >= 0.75 ? "critical_care_evaluation" : "close_monitoring",
      recommendedTests: ["ABG/VBG", "Continuous telemetry"],
    },
    reasoning: "Combines oxygenation, blood pressure, mental status, and respiratory strain.",
    flags: risk >= 0.85 ? ["critical"] : [],
  };
}

async function respiratorySupportAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const spo2 = p.vitals?.spo2 ?? 100;
  const rr = p.vitals?.rr ?? 16;
  const rec =
    spo2 < 85 ? "prepare_for_advanced_airway" :
    spo2 < 90 || rr > 30 ? "high_flow_or_niv_assessment" :
    "supplemental_oxygen_if_needed";

  return {
    council: "icu",
    agent: "icu_respiratory_support",
    confidence: 0.8,
    result: {
      risk: spo2 < 90 ? 0.8 : 0.3,
      recommendation: rec,
      recommendedTests: ["Repeat pulse oximetry", "ABG"],
    },
    reasoning: "Escalates respiratory support according to saturation and work of breathing.",
    flags: ["safe-plan", ...(spo2 < 85 ? ["critical"] : [])],
  };
}

async function hemodynamicAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const sbp = p.vitals?.systolic ?? 120;
  const lactate = p.labs?.lactate ?? 0;
  const rec =
    sbp < 80 ? "pressors_after_initial_fluids" :
    sbp < 90 || lactate > 2 ? "fluid_resuscitation_with_reassessment" :
    "maintain_monitoring";

  return {
    council: "icu",
    agent: "icu_hemodynamics",
    confidence: 0.78,
    result: {
      risk: sbp < 90 ? 0.82 : lactate > 2 ? 0.55 : 0.2,
      recommendation: rec,
      recommendedTests: ["Repeat lactate", "MAP monitoring"],
    },
    reasoning: "Translates shock physiology into a hemodynamic support plan.",
    flags: sbp < 90 ? ["critical"] : [],
  };
}

async function icuSafetyAgent(input: AgentInput): Promise<AgentOutput> {
  const p = input.patient;
  const flags: string[] = [];
  if ((p.vitals?.systolic ?? 120) < 90) flags.push("critical");
  if ((p.vitals?.spo2 ?? 100) < 90) flags.push("critical");
  if (p.exam?.alteredMentalStatus) flags.push("critical");

  return {
    council: "icu",
    agent: "icu_safety",
    confidence: 0.92,
    result: {
      risk: flags.length ? 0.9 : 0.25,
      recommendation: flags.length
        ? "do_not_manage_without_high_acuity_monitoring"
        : "monitor_and_reassess",
    },
    reasoning: "Prevents under-triage of unstable physiology.",
    flags,
  };
}

const graphAdapter = new AgentGraphAdapter(
  buildICUGraph(),
  () => ["symptom:instability"],
);

export class ICUGraphCouncil extends BaseCouncil {
  constructor() {
    super("icu", [
      icuDeteriorationAgent,
      respiratorySupportAgent,
      hemodynamicAgent,
      icuSafetyAgent,
    ], graphAdapter);
  }

  protected finalize(consensus: any, outputs: AgentOutput[]): Record<string, unknown> {
    const tests = outputs.flatMap(o =>
      Array.isArray(o.result.recommendedTests) ? o.result.recommendedTests as string[] : [],
    );
    return {
      specialty: "icu",
      action: consensus.risk >= 0.8 ? "icu_admission_or_resuscitation_bay" : "step_up_monitoring",
      recommendation: consensus.recommendation,
      urgency: consensus.urgency,
      recommendedTests: dedupeStrings(tests),
    };
  }
}

export const icuGraphCouncil = new ICUGraphCouncil();
