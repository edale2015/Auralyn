/**
 * National Orchestrator
 *
 * "The national nervous system."
 *
 * Coordinates the six national intelligence modules:
 *   1. Federation Engine        — aggregate all regional states
 *   2. Cross-Region Learning    — network-effect clinical intelligence
 *   3. National Load Balancer   — route demand across regions
 *   4. Policy + Compliance      — enforce jurisdictional rules
 *   5. Autonomous Scaling       — detect and prescribe capacity responses
 *   6. National Population      — CDC-like epidemiological surveillance
 *
 * Architecture:
 *   Patient → Clinical Brain → Hospital Brain → Regional Orchestrator
 *                                                      ↓
 *                                          National Orchestrator
 *                                                      ↓
 *                                       Global Intelligence (next layer)
 */

import { aggregateRegionalStates, type RegionalSummaryInput } from "./federationEngine";
import { mergeLearningSignals }                                from "./crossRegionLearning";
import { balanceAcrossRegions }                                from "./nationalLoadBalancer";
import { enforceRegionalPolicies }                             from "./policyLayer";
import { computeScalingActions }                               from "./scalingController";
import { detectNationalPatterns }                              from "./nationalPopulation";

export interface NationalOrchestrationInput {
  traceId?:       string;
  regions:        RegionalSummaryInput[];
  policyContext?: {
    state?:   string;
    country?: string;
  };
}

export interface NationalOrchestrationOutput {
  federation:    ReturnType<typeof aggregateRegionalStates>;
  learning:      ReturnType<typeof mergeLearningSignals>;
  loadBalance:   ReturnType<typeof balanceAcrossRegions>;
  policy:        ReturnType<typeof enforceRegionalPolicies>;
  scaling:       ReturnType<typeof computeScalingActions>;
  population:    ReturnType<typeof detectNationalPatterns>;
  summary: {
    totalRegions:        number;
    totalPatients:       number;
    criticalRegions:     number;
    scalingActionsCount: number;
    scalingAlertLevel:   string;
    nationalPatternAlert: boolean;
    pandemicSignal:      boolean;
    topRecommendation:   string | null;
  };
}

export async function runNationalOrchestration(
  input: NationalOrchestrationInput
): Promise<NationalOrchestrationOutput> {
  const { regions, policyContext = {} } = input;

  // ── Stage 1: Federation — unify all regional states ───────────────────────
  const federation = aggregateRegionalStates(regions);

  // ── Stage 2: Cross-region learning ───────────────────────────────────────
  const learning = mergeLearningSignals(regions);

  // ── Stage 3: Load balancing ───────────────────────────────────────────────
  const loadBalance = balanceAcrossRegions({ regions });

  // ── Stage 4: Policy enforcement ───────────────────────────────────────────
  const policy = enforceRegionalPolicies({
    state:   policyContext.state,
    country: policyContext.country ?? "US",
  });

  // ── Stage 5: Autonomous scaling ───────────────────────────────────────────
  const population = detectNationalPatterns(regions);

  const scaling = computeScalingActions({
    totalPatients:        federation.totalPatients,
    avgStrainScore:       federation.avgStrainScore,
    totalER:              federation.totalER,
    criticalRegions:      federation.criticalRegions,
    surgeRegions:         federation.surgeRegions,
    nationalPatternAlert: population.alert,
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const topRecommendation =
    scaling.actions[0]?.action ??
    learning.recommendation ??
    (population.publicHealthAlerts[0] ?? null);

  return {
    federation,
    learning,
    loadBalance,
    policy,
    scaling,
    population,
    summary: {
      totalRegions:         regions.length,
      totalPatients:        federation.totalPatients,
      criticalRegions:      federation.criticalRegions.length,
      scalingActionsCount:  scaling.actions.length,
      scalingAlertLevel:    scaling.alertLevel,
      nationalPatternAlert: population.alert,
      pandemicSignal:       population.pandemicSignal,
      topRecommendation,
    },
  };
}
