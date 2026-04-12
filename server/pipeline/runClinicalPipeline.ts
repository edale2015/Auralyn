/**
 * Clinical Pipeline — Core 5-step brain
 * Token → Temperature → Shadow Safety → Trace → Output
 */

import { createClinicalTokenSet }  from "../core/clinicalTokens";
import { applyDecisionTemperature } from "../engine/decisionTemperature";
import { applyShadowSafety }        from "../safety/shadowEngine";
import { buildTrace }               from "../audit/traceEngine";
import { generateClinicalOutput }   from "../output/clinicalOutput";

export async function runClinicalPipeline(input: Record<string, any>) {
  let tokens = createClinicalTokenSet(input);

  tokens = applyDecisionTemperature(tokens);

  const tokensWithShadow = applyShadowSafety(tokens);

  const trace  = buildTrace(tokensWithShadow);
  const output = generateClinicalOutput(tokensWithShadow);

  return {
    traceId:        tokens.traceId,
    trace,
    output,
    riskLevel:      tokensWithShadow.riskLevel,
    shadowOverrides:tokensWithShadow.shadowOverrides,
    tokens: {
      complaint:        tokensWithShadow.complaint,
      redFlags:         tokensWithShadow.redFlags,
      allowedDiagnoses: tokensWithShadow.allowedDiagnoses,
      riskLevel:        tokensWithShadow.riskLevel,
      requiresPhysicianReview: tokensWithShadow.requiresPhysicianReview,
    },
  };
}
