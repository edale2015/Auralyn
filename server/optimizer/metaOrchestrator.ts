import { optimizeClinicServices, balanceCapacity, optimizeServiceMix, type ServiceLine } from "./clinicOptimizer";
import { analyzeNetwork, type PayerPerformance } from "../strategy/networkStrategyEngine";
import { calculateDynamicPrice } from "../strategy/dynamicPricingEngine";
import { choosePayerRoute, type RoutingOption } from "../strategy/multiPayerRoutingEngine";
import { computeBusinessMetrics } from "../agents/selfImprove";

export interface SystemState {
  services: ServiceLine[];
  payers: PayerPerformance[];
  load: number;
  demand: number;
  budget?: number;
  claims?: Array<{ revenue: number; paid: boolean }>;
  channels?: Array<{ name: string; costPerPatient: number; conversionRate: number; avgRevenue: number }>;
}

export interface OrchestratorResult {
  clinicPlan: ReturnType<typeof optimizeClinicServices>;
  networkPlan: ReturnType<typeof analyzeNetwork>;
  capacityStatus: ReturnType<typeof balanceCapacity>;
  businessMetrics?: ReturnType<typeof computeBusinessMetrics>;
  channelAllocation?: Array<{ channel: string; roi: number; allocation: number }>;
  overallStrategy: string;
  timestamp: string;
}

export function runMetaOrchestrator(state: SystemState): OrchestratorResult {
  const clinicPlan = optimizeClinicServices(state.services);
  const networkPlan = analyzeNetwork(state.payers);
  const capacityStatus = balanceCapacity(state.load, state.demand);

  let businessMetrics: OrchestratorResult["businessMetrics"];
  if (state.claims && state.claims.length > 0) {
    businessMetrics = computeBusinessMetrics(state.claims);
  }

  let channelAllocation: OrchestratorResult["channelAllocation"];
  if (state.channels && state.budget) {
    channelAllocation = state.channels.map((c) => {
      const roi = Math.round(((c.avgRevenue * c.conversionRate) / c.costPerPatient) * 100) / 100;
      return { channel: c.name, roi, allocation: Math.round(state.budget! * (roi / 10)) };
    }).sort((a, b) => b.roi - a.roi);
  }

  const expandServices = clinicPlan.filter((s) => s.action === "expand").length;
  const expandPayers = networkPlan.filter((p) => p.strategy === "expand").length;
  const problemPayers = networkPlan.filter((p) => p.strategy === "reduce" || p.strategy === "drop").length;

  let overallStrategy: string;
  if (capacityStatus.status === "overloaded") {
    overallStrategy = "CAPACITY CRITICAL: Increase pricing and add capacity before expanding volume";
  } else if (problemPayers > expandPayers) {
    overallStrategy = "PAYER OPTIMIZATION: Fix underperforming payer contracts before scaling";
  } else if (expandServices > 0 && capacityStatus.status !== "overloaded") {
    overallStrategy = "GROWTH MODE: Expand high-performing services and increase patient acquisition";
  } else {
    overallStrategy = "OPTIMIZATION: Maintain current operations and monitor for opportunities";
  }

  return {
    clinicPlan,
    networkPlan,
    capacityStatus,
    businessMetrics,
    channelAllocation,
    overallStrategy,
    timestamp: new Date().toISOString(),
  };
}

export function routeEncounterStrategy(
  encounter: any,
  payerOptions: RoutingOption[],
  demandLevel: number,
  capacityUtilization: number,
): {
  payerDecision: ReturnType<typeof choosePayerRoute>;
  pricing: ReturnType<typeof calculateDynamicPrice> | null;
  finalRevenue: number;
} {
  const payerDecision = choosePayerRoute(encounter, payerOptions);

  let pricing: ReturnType<typeof calculateDynamicPrice> | null = null;
  let finalRevenue = payerDecision.rawRevenue;

  if (payerDecision.payer === "cash" || payerDecision.payer === "self_pay") {
    pricing = calculateDynamicPrice({
      basePrice: payerDecision.rawRevenue,
      demandLevel,
      capacityUtilization,
      payerType: "cash",
    });
    finalRevenue = pricing.finalPrice;
  }

  return { payerDecision, pricing, finalRevenue };
}
