import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { autoFixEncounter } from "../billing/autoFixEngine";
import { predictDenial } from "../billing/denialPredictionEngine";
import { getLearnedDenialScore } from "../billing/claimOutcomeLearning";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

export const billingAgent: Agent = {
  name: "billing",
  priority: 30,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();

    const diagnosis = priorResults.diagnosis;
    if (!diagnosis?.coding) {
      logAgent("billing", { skipped: true, reason: "no coding data" }, Date.now() - start);
      return { skipped: true, reason: "No diagnosis coding available" };
    }

    const coding = {
      primary: diagnosis.coding.primary,
      differentials: [],
      cpt: diagnosis.coding.cpt,
      allCodes: [diagnosis.coding.primary.icd10],
      codingConfidence: diagnosis.coding.codingConfidence,
      warnings: diagnosis.coding.warnings || [],
    };

    const riskClassification = priorResults.safety?.riskClassification || {
      level: "LOW",
      requiresPhysicianReview: false,
      requiresAuditTrail: false,
      escalationRequired: false,
      reason: "Default",
    };

    const denial = predictDenial({
      coding,
      riskClassification,
      encounter: {
        complaint: ctx.text,
        diagnosis: diagnosis.dx,
        triage: diagnosis.triage,
        confidence: diagnosis.confidence,
      },
      clinicalNote: {
        hpi: `Chief Complaint: ${ctx.text}`,
        assessment: `Primary: ${diagnosis.dx} (ICD-10: ${coding.primary.icd10})`,
        plan: `Disposition: ${priorResults.triage?.disposition || diagnosis.triage}`,
      },
    });

    const fix = autoFixEncounter(coding, denial, {
      triage: diagnosis.triage,
      confidence: diagnosis.confidence,
    });

    const learnedScore = getLearnedDenialScore(coding.primary.icd10, fix.finalCpt);
    const adjustedRisk = Math.round(Math.max(denial.riskScore * (1 - learnedScore * 0.3), 0) * 1000) / 1000;

    const result = {
      icd10: coding.primary.icd10,
      cpt: fix.finalCpt,
      originalCpt: fix.originalCpt,
      autoFixApplied: fix.applied,
      fixes: fix.fixes,
      denialRisk: denial.riskScore,
      denialReasons: denial.reasons,
      adjustedRisk,
      learnedScore,
      charge: estimateCharge(fix.finalCpt),
    };

    if (denial.riskScore > 0.5) {
      publish("billing:high_denial_risk", { icd10: coding.primary.icd10, cpt: fix.finalCpt, risk: denial.riskScore });
    }

    logAgent("billing", { cpt: fix.finalCpt, denialRisk: denial.riskScore, adjustedRisk }, Date.now() - start);
    return result;
  },
};

function estimateCharge(cpt: string): number {
  const charges: Record<string, number> = {
    "99213": 150, "99214": 225, "99215": 350,
    "99203": 175, "99204": 275, "99205": 400,
    "99281": 100, "99282": 175, "99283": 250,
    "99284": 400, "99285": 600,
    "99441": 75, "99442": 125, "99443": 200,
  };
  return charges[cpt] || 150;
}
