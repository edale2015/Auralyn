/**
 * Full Pipeline — Complete System Brain
 * Adds specialist council consensus on top of the core 5-step pipeline.
 * This is the main entry point for the /api/triage route.
 */

import { createClinicalTokenSet }  from "../core/clinicalTokens";
import { applyDecisionTemperature } from "../engine/decisionTemperature";
import { applyShadowSafety }        from "../safety/shadowEngine";
import { buildTrace }               from "../audit/traceEngine";
import { generateClinicalOutput }   from "../output/clinicalOutput";
import { runSpecialistCouncil }     from "../agents/specialistCouncil";

export async function runFullPipeline(input: Record<string, any>) {
  let tokens = createClinicalTokenSet(input);

  tokens = applyDecisionTemperature(tokens);
  const tokensWithShadow = applyShadowSafety(tokens);

  const trace               = buildTrace(tokensWithShadow);
  const specialistConsensus = await runSpecialistCouncil(tokensWithShadow);
  const output              = generateClinicalOutput(tokensWithShadow);

  return {
    traceId:           tokens.traceId,
    trace,
    specialistConsensus,
    output,
    riskLevel:         tokensWithShadow.riskLevel,
    shadowOverrides:   tokensWithShadow.shadowOverrides,
    tokens: {
      complaint:               tokensWithShadow.complaint,
      redFlags:                tokensWithShadow.redFlags,
      allowedDiagnoses:        tokensWithShadow.allowedDiagnoses,
      riskLevel:               tokensWithShadow.riskLevel,
      requiresPhysicianReview: tokensWithShadow.requiresPhysicianReview,
    },
  };
}
