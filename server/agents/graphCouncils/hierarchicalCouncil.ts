import type { AgentInput, AgentOutput, CouncilRunResult } from "./types";
import { cardiologyGraphCouncil } from "./cardiologyCouncil";
import { infectiousDiseaseGraphCouncil } from "./infectiousDiseaseCouncil";
import { icuGraphCouncil } from "./icuCouncil";
import { buildMasterGraph } from "../../reasoning/specialistGraphs";
import { AgentGraphAdapter } from "../../reasoning/agentGraphAdapter";
import { graphDebateEngine } from "./debateEngine";
import { graphConsensusEngine } from "./consensusEngine";
import { dedupeStrings } from "./utils";
import { logCouncilTelemetry } from "../../controlTower/councilTelemetry";

function councilPriority(input: AgentInput): Array<"cardiology" | "infectious_disease" | "icu"> {
  const p = input.patient;
  const priorities: Array<{ name: "cardiology" | "infectious_disease" | "icu"; score: number }> = [
    { name: "cardiology",         score: 0 },
    { name: "infectious_disease", score: 0 },
    { name: "icu",                score: 0 },
  ];

  if (p.exam?.chestPain || p.tests?.ecgStElevation || (p.labs?.troponin ?? 0) > 0.04) priorities[0].score += 3;
  if ((p.vitals?.temp ?? 37) > 38.3 || (p.labs?.lactate ?? 0) > 2 || p.exam?.dysuria || p.tests?.infiltrateOnCxr) priorities[1].score += 3;
  if ((p.vitals?.spo2 ?? 100) < 90 || (p.vitals?.systolic ?? 120) < 90 || p.exam?.alteredMentalStatus) priorities[2].score += 4;

  return priorities.sort((a, b) => b.score - a.score).map(p => p.name);
}

const masterGraphAdapter = new AgentGraphAdapter(
  buildMasterGraph(),
  () => ["master:start"],
);

export interface HierarchicalGraphCouncilResult {
  traceId: string;
  activeCouncils: string[];
  specialistCouncils: CouncilRunResult[];
  crossCouncilDebate: ReturnType<typeof graphDebateEngine.generateCritiques>;
  masterConsensus: ReturnType<typeof graphConsensusEngine.compute>;
  masterReasoningPaths: { path: string[]; score: number; riskAccum: number }[];
  finalDecision: {
    action: string;
    disposition: string;
    rationale: string;
    recommendation?: string;
    recommendedTests: string[];
    flags: string[];
  };
}

export class HierarchicalGraphCouncil {
  async run(input: AgentInput): Promise<HierarchicalGraphCouncilResult> {
    const priorities = councilPriority(input);

    const selected = new Set(priorities.slice(0, 2));
    if ((input.patient.vitals?.spo2 ?? 100) < 92 || (input.patient.vitals?.systolic ?? 120) < 95) {
      selected.add("icu");
    }

    const councilPromises = [
      selected.has("cardiology")         ? cardiologyGraphCouncil.run({ ...input, council: "cardiology" })                 : null,
      selected.has("infectious_disease") ? infectiousDiseaseGraphCouncil.run({ ...input, council: "infectious_disease" }) : null,
      selected.has("icu")                ? icuGraphCouncil.run({ ...input, council: "icu" })                               : null,
    ].filter(Boolean) as Promise<CouncilRunResult>[];

    const specialistCouncils = await Promise.all(councilPromises);

    const councilAsAgentOutputs: AgentOutput[] = specialistCouncils.map(c => ({
      council: "master" as const,
      agent: `${c.council}_council`,
      confidence: c.consensus.confidence,
      result: {
        risk: c.consensus.risk,
        recommendation: c.finalDecision.action || c.consensus.recommendation,
        recommendedTests: c.finalDecision.recommendedTests || [],
      },
      reasoning: `${c.council} sub-council synthesis`,
      flags: c.consensus.flags || [],
    }));

    const crossCouncilDebate = graphDebateEngine.generateCritiques(councilAsAgentOutputs);
    const adjustedCouncilOutputs = graphDebateEngine.apply(crossCouncilDebate, councilAsAgentOutputs);
    const masterConsensus = graphConsensusEngine.compute(adjustedCouncilOutputs);

    const masterReasoningPaths = masterGraphAdapter.buildPaths(adjustedCouncilOutputs, {
      ...input.patient,
      masterRisk: masterConsensus.risk,
    });

    const finalDecision = this.finalize(masterConsensus, specialistCouncils);

    await logCouncilTelemetry("master", {
      traceId: input.traceId,
      activeCouncils: [...selected],
      risk: masterConsensus.risk,
      urgency: masterConsensus.urgency,
      disagreement: masterConsensus.disagreement,
      disposition: finalDecision.disposition,
    });

    for (const council of specialistCouncils) {
      await logCouncilTelemetry(council.council, {
        traceId: input.traceId,
        risk: council.consensus.risk,
        urgency: council.consensus.urgency,
        disagreement: council.consensus.disagreement,
      });
    }

    return {
      traceId: input.traceId,
      activeCouncils: [...selected],
      specialistCouncils,
      crossCouncilDebate,
      masterConsensus,
      masterReasoningPaths,
      finalDecision,
    };
  }

  private finalize(masterConsensus: ReturnType<typeof graphConsensusEngine.compute>, councils: CouncilRunResult[]) {
    const allFlags = dedupeStrings(councils.flatMap(c => c.consensus.flags || []));
    const recommendedTests = dedupeStrings(
      councils.flatMap(c => (c.finalDecision.recommendedTests as string[]) || []),
    );

    const hasCritical             = allFlags.includes("critical");
    const hasICU                  = councils.some(c => c.council === "icu"                && c.consensus.risk >= 0.75);
    const hasCardiologyEmergency  = councils.some(c => c.council === "cardiology"         && c.consensus.risk >= 0.75);
    const hasSepsis               = councils.some(c => c.council === "infectious_disease" && c.consensus.risk >= 0.75);

    let disposition = "outpatient";
    let action      = "specialty_followup";
    let rationale   = "No high-acuity specialty council crossed escalation thresholds.";

    if (hasCritical || masterConsensus.disagreement > 0.45) {
      disposition = "physician_required";
      action      = "immediate_physician_review";
      rationale   = hasCritical
        ? "At least one specialist council detected critical instability."
        : "Cross-council disagreement is too high for autonomous closure.";
    } else if (hasICU || masterConsensus.risk >= 0.85) {
      disposition = "icu";
      action      = "escalate_to_icu";
      rationale   = "Master council converged on high probability of instability requiring ICU-level care.";
    } else if (hasCardiologyEmergency || hasSepsis || masterConsensus.risk >= 0.65) {
      disposition = "ed_or_admit";
      action      = "urgent_hospital_evaluation";
      rationale   = "Specialist consensus indicates urgent pathology requiring acute care resources.";
    }

    return { action, disposition, rationale, recommendation: masterConsensus.recommendation, recommendedTests, flags: allFlags };
  }
}

export const hierarchicalGraphCouncil = new HierarchicalGraphCouncil();
