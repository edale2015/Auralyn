type CapacityState = {
  load: number;
  demand: number;
};

type CapacityResult = {
  status: string;
  action: string;
  load: number;
  demand: number;
  efficiency: number;
};

export class CapacityEngine {
  balance(load: number, demand: number): CapacityResult {
    const efficiency = demand > 0 ? load / demand : 0;

    let status: string;
    let action: string;

    if (load > 0.95) {
      status = "critical";
      action = "Immediately increase capacity or limit intake. Consider surge pricing.";
    } else if (load > 0.85) {
      status = "high";
      action = "Monitor closely. Prepare to scale workers and increase pricing.";
    } else if (load > 0.6 && demand > 0.7) {
      status = "optimal";
      action = "Operating at ideal capacity. Maintain current operations.";
    } else if (load < 0.4 && demand > 0.6) {
      status = "underutilized";
      action = "Increase marketing spend and patient acquisition.";
    } else if (load < 0.3) {
      status = "low";
      action = "Significantly increase marketing. Consider promotional pricing.";
    } else {
      status = "stable";
      action = "System balanced. Monitor for changes.";
    }

    return { status, action, load, demand, efficiency: Math.round(efficiency * 100) / 100 };
  }
}

export class ServiceMixEngine {
  optimize(services: Array<{ name: string; revenue: number; cost: number; volume: number; satisfaction: number }>) {
    return services.map(s => {
      const margin = s.revenue - s.cost;
      const marginPercent = s.revenue > 0 ? margin / s.revenue : 0;

      let recommendation: string;
      let priority: string;

      if (margin > 100 && s.satisfaction > 0.8) {
        recommendation = "expand";
        priority = "high";
      } else if (margin > 70 && s.satisfaction > 0.6) {
        recommendation = "maintain";
        priority = "medium";
      } else if (margin < 30 && s.volume < 10) {
        recommendation = "reduce";
        priority = "low";
      } else if (margin < 50) {
        recommendation = "optimize pricing";
        priority = "medium";
      } else {
        recommendation = "maintain";
        priority = "medium";
      }

      return {
        service: s.name,
        margin: Math.round(margin),
        marginPercent: Math.round(marginPercent * 100),
        volume: s.volume,
        satisfaction: s.satisfaction,
        recommendation,
        priority
      };
    }).sort((a, b) => b.margin - a.margin);
  }
}

export const capacityEngine = new CapacityEngine();
export const serviceMixEngine = new ServiceMixEngine();
