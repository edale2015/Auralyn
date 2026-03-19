export interface ServiceLine {
  name: string;
  avgRevenue: number;
  demand: number;
  capacity: number;
  denialRate: number;
  costPerEncounter?: number;
}

export interface ServiceOptimization {
  service: string;
  score: number;
  action: "expand" | "maintain" | "increase_pricing" | "fix_billing" | "reduce";
  reasoning: string;
  projectedImpact: string;
}

export function optimizeClinicServices(services: ServiceLine[]): ServiceOptimization[] {
  return services.map((s) => {
    const score = Math.round(s.avgRevenue * s.demand * (1 - s.denialRate) * (1 - s.capacity * 0.5) * 100) / 100;

    let action: ServiceOptimization["action"] = "maintain";
    let reasoning = "Current performance is adequate";
    let projectedImpact = "Stable revenue expected";

    if (score > 80) {
      action = "expand";
      reasoning = `High score (${score}) — strong revenue, demand, and low denials`;
      projectedImpact = "Potential +20-30% revenue with increased volume";
    } else if (s.capacity > 0.9) {
      action = "increase_pricing";
      reasoning = `Near capacity (${(s.capacity * 100).toFixed(0)}%) — demand exceeds supply`;
      projectedImpact = "Price increase of 10-20% without volume loss";
    } else if (s.denialRate > 0.15) {
      action = "fix_billing";
      reasoning = `High denial rate (${(s.denialRate * 100).toFixed(0)}%) destroying revenue`;
      projectedImpact = `Fixing denials could recover $${Math.round(s.avgRevenue * s.denialRate * 100)} per 100 encounters`;
    } else if (s.demand < 0.2 && s.avgRevenue < 80) {
      action = "reduce";
      reasoning = "Low demand and low revenue — consider reallocating resources";
      projectedImpact = "Cost savings from resource reallocation";
    }

    return { service: s.name, score, action, reasoning, projectedImpact };
  }).sort((a, b) => b.score - a.score);
}

export interface CapacityRecommendation {
  status: "overloaded" | "underutilized" | "stable";
  recommendation: string;
  load: number;
  demand: number;
}

export function balanceCapacity(load: number, demand: number): CapacityRecommendation {
  if (load > 0.9) {
    return {
      status: "overloaded",
      recommendation: "Increase pricing, add capacity, or reduce intake volume",
      load,
      demand,
    };
  }
  if (load < 0.4 && demand > 0.6) {
    return {
      status: "underutilized",
      recommendation: "Increase marketing spend — demand exists but patients aren't converting",
      load,
      demand,
    };
  }
  if (load < 0.3) {
    return {
      status: "underutilized",
      recommendation: "Expand service lines or increase patient acquisition",
      load,
      demand,
    };
  }
  return { status: "stable", recommendation: "Operating within optimal range", load, demand };
}

export interface ServiceMixResult {
  service: string;
  margin: number;
  recommendation: "expand" | "maintain" | "reduce";
}

export function optimizeServiceMix(
  services: Array<{ name: string; revenue: number; cost: number }>,
): ServiceMixResult[] {
  return services.map((s) => {
    const margin = s.revenue - s.cost;
    let recommendation: ServiceMixResult["recommendation"] = "maintain";
    if (margin > 100) recommendation = "expand";
    else if (margin < 30) recommendation = "reduce";
    return { service: s.name, margin: Math.round(margin), recommendation };
  }).sort((a, b) => b.margin - a.margin);
}
