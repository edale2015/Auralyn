/**
 * hierarchicalCouncil.ts
 * Master council — orchestrates specialist sub-councils and synthesises
 * a final cross-specialty clinical decision.
 *
 * Architecture:
 *   Patient Case
 *     ↓
 *   [ Specialty Councils ] — Cardiology, ID, ICU (activated by bandit)
 *     ↓
 *   [ Cross-Council Debate ] — specialist outputs challenge each other
 *     ↓
 *   [ Master Consensus ] — weighted synthesis
 *     ↓
 *   Final Disposition + Confidence + Escalation decision
 *
 * Each specialist council runs its own internal debate round before
 * contributing to the master council.
 */

import { runCardiologyCouncil }         from "./specialists/cardiologyCouncil";
import { runInfectiousDiseaseCouncil }  from "./specialists/infectiousDiseaseCouncil";
import { runICUCouncil }                from "./specialists/icuCouncil";
import { councilActivationBandit }      from "./councilActivationBandit";
import { multiAgentCouncil }            from "./multiAgentCouncil";
import { debateEngine }                 from "./debateEngine";
import { consensusEngine }              from "./consensusEngine";
import type { AgentOutput }             from "./debateEngine";

export interface HierarchicalCouncilInput {
  patientId?:   string;
  symptoms:     string[];
  answers:      Record<string, any>;
  vitals?:      Record<string, any>;
  riskScore?:   number;
  riskLevel?:   "low" | "moderate" | "high" | "unknown";
  redFlags?:    string[];
  differentials?: any[];
  brainOutput?: Record<string, any>;
}

export interface HierarchicalCouncilOutput {
  patientId?:            string;
  finalDisposition:      string;
  masterConsensus:       any;
  activatedCouncils:     string[];
  specialistOutputs:     Record<string, any>;
  crossCouncilDebate:    any[];
  masterRecommendation:  string;
  escalated:             boolean;
  durationMs:            number;
}

export async function runHierarchicalCouncil(
  input: HierarchicalCouncilInput,
): Promise<HierarchicalCouncilOutput> {
  const start = Date.now();

  const ctx = {
    symptoms:  input.symptoms,
    answers:   input.answers,
    riskScore: input.riskScore,
    riskLevel: input.riskLevel,
    redFlags:  input.redFlags,
  };

  const [activateCardio, activateID, activateICU] = await Promise.all([
    councilActivationBandit.shouldActivate("cardiology",         ctx),
    councilActivationBandit.shouldActivate("infectious_disease", ctx),
    councilActivationBandit.shouldActivate("icu",                ctx),
  ]);

  const activatedCouncils: string[] = [];
  const specialistOutputs: Record<string, any> = {};

  const specialistPromises: Promise<void>[] = [];

  if (activateCardio) {
    activatedCouncils.push("cardiology");
    specialistPromises.push(
      runCardiologyCouncil({
        symptoms:       input.symptoms,
        answers:        input.answers,
        vitals:         input.vitals,
        differentials:  input.differentials?.map((d: any) => ({
          diagnosis: d.clusterId ?? d.diagnosis ?? "",
          score:     d.posteriorProbability ?? d.score ?? 0,
        })),
        riskScore: input.riskScore,
      }).then((r) => { specialistOutputs.cardiology = r; }),
    );
  }

  if (activateID) {
    activatedCouncils.push("infectious_disease");
    specialistPromises.push(
      runInfectiousDiseaseCouncil({
        symptoms:      input.symptoms,
        answers:       input.answers,
        vitals:        input.vitals,
        differentials: input.differentials?.map((d: any) => ({
          diagnosis: d.clusterId ?? d.diagnosis ?? "",
          score:     d.posteriorProbability ?? d.score ?? 0,
        })),
      }).then((r) => { specialistOutputs.infectious_disease = r; }),
    );
  }

  if (activateICU) {
    activatedCouncils.push("icu");
    specialistPromises.push(
      runICUCouncil({
        symptoms:   input.symptoms,
        answers:    input.answers,
        vitals:     input.vitals,
        riskScore:  input.riskScore,
        sepsisRisk: specialistOutputs.infectious_disease?.sepsisRisk,
      }).then((r) => { specialistOutputs.icu = r; }),
    );
  }

  const baseCouncilPromise = multiAgentCouncil.run({
    patient: {
      ...input.brainOutput,
      normalizedSymptoms: input.symptoms,
      differentials:      input.differentials ?? [],
    },
  }).then((r) => { specialistOutputs.base = r; });

  await Promise.allSettled([...specialistPromises, baseCouncilPromise]);

  const crossCouncilAgents: AgentOutput[] = Object.entries(specialistOutputs).map(
    ([name, out]) => ({
      agent:      name,
      confidence: out.confidence ?? out.consensus?.avgConfidence ?? 0.5,
      result:     out,
      reasoning:  `${name} council output`,
    }),
  );

  const crossCritiques   = debateEngine.generateCritiques(crossCouncilAgents);
  const adjustedAgents   = debateEngine.apply(crossCritiques, crossCouncilAgents);
  const masterConsensus  = consensusEngine.compute(adjustedAgents);

  const urgencies = Object.values(specialistOutputs).map((o: any) => o.urgency ?? "routine");
  const topUrgency: string =
    urgencies.includes("emergent") ? "emergent" :
    urgencies.includes("urgent")   ? "urgent"   : "routine";

  let finalDisposition: string;
  if (masterConsensus.highDisagreement) {
    finalDisposition = "physician_required";
  } else if (topUrgency === "emergent" || masterConsensus.weightedRisk >= 0.8) {
    finalDisposition = "ER_NOW";
  } else if (topUrgency === "urgent" || masterConsensus.weightedRisk >= 0.5) {
    finalDisposition = "urgent_care";
  } else {
    finalDisposition = "outpatient";
  }

  const recs: string[] = [];
  for (const [, out] of Object.entries(specialistOutputs)) {
    if ((out as any).recommendation) recs.push((out as any).recommendation);
  }

  const masterRecommendation =
    recs.length > 0
      ? recs.join(" | ")
      : "Follow standard clinical pathway per presenting complaint";

  const escalated = finalDisposition === "ER_NOW" || finalDisposition === "physician_required";

  return {
    patientId:           input.patientId,
    finalDisposition,
    masterConsensus,
    activatedCouncils,
    specialistOutputs,
    crossCouncilDebate:  crossCritiques,
    masterRecommendation,
    escalated,
    durationMs:          Date.now() - start,
  };
}
