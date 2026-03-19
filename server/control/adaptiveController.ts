type SystemState = {
  revenuePerHour: number;
  denialRate: number;
  waitTime: number;
  capacity: number;
};

type ControlAction = {
  pricingAdjustment: number;
  routingBias: string;
  intakeLimit: number;
  reasoning: string[];
};

export class AdaptiveController {
  decide(state: SystemState): ControlAction {
    const action: ControlAction = {
      pricingAdjustment: 1.0,
      routingBias: "balanced",
      intakeLimit: 1.0,
      reasoning: []
    };

    if (state.revenuePerHour < 500) {
      action.pricingAdjustment = 1.15;
      action.reasoning.push("Revenue below target — increasing pricing 15%");
    } else if (state.revenuePerHour < 1000) {
      action.pricingAdjustment = 1.05;
      action.reasoning.push("Revenue slightly below target — increasing pricing 5%");
    } else if (state.revenuePerHour > 3000) {
      action.pricingAdjustment = 0.95;
      action.reasoning.push("Revenue high — slight discount to increase volume");
    }

    if (state.denialRate > 0.15) {
      action.routingBias = "low-risk-payers";
      action.reasoning.push("High denial rate — routing to low-risk payers");
    } else if (state.denialRate > 0.1) {
      action.routingBias = "moderate-caution";
      action.reasoning.push("Elevated denial rate — moderate caution in routing");
    }

    if (state.waitTime > 45) {
      action.intakeLimit = 0.6;
      action.reasoning.push("Wait time critical — reducing intake to 60%");
    } else if (state.waitTime > 30) {
      action.intakeLimit = 0.8;
      action.reasoning.push("Wait time elevated — reducing intake to 80%");
    }

    if (state.capacity > 0.95) {
      action.intakeLimit = Math.min(action.intakeLimit, 0.5);
      action.pricingAdjustment = Math.max(action.pricingAdjustment, 1.2);
      action.reasoning.push("Near full capacity — surge pricing + intake limit");
    } else if (state.capacity < 0.3) {
      action.pricingAdjustment = Math.min(action.pricingAdjustment, 0.9);
      action.reasoning.push("Low capacity utilization — discounting to attract volume");
    }

    if (action.reasoning.length === 0) {
      action.reasoning.push("System operating normally — no adjustments needed");
    }

    return action;
  }
}

export class ControlPolicy {
  enforce(action: ControlAction): ControlAction {
    const enforced = { ...action };

    if (enforced.pricingAdjustment > 1.25) {
      enforced.pricingAdjustment = 1.25;
      enforced.reasoning.push("Policy: capped pricing adjustment at +25%");
    }
    if (enforced.pricingAdjustment < 0.75) {
      enforced.pricingAdjustment = 0.75;
      enforced.reasoning.push("Policy: floor pricing adjustment at -25%");
    }

    if (enforced.intakeLimit < 0.4) {
      enforced.intakeLimit = 0.4;
      enforced.reasoning.push("Policy: minimum intake limit 40%");
    }

    return enforced;
  }
}

export class MultiObjectiveOptimizer {
  score(state: SystemState): { overall: number; revenue: number; safety: number; experience: number } {
    const revenueScore = Math.min(state.revenuePerHour / 2000, 1);
    const safetyScore = 1 - Math.min(state.denialRate, 0.5);
    const experienceScore = Math.max(1 - state.waitTime / 60, 0);

    return {
      overall: 0.5 * revenueScore + 0.3 * safetyScore + 0.2 * experienceScore,
      revenue: revenueScore,
      safety: safetyScore,
      experience: experienceScore
    };
  }
}

export class SafetyEnvelope {
  validate(state: SystemState): { safe: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (state.denialRate > 0.2) {
      warnings.push("CRITICAL: Denial rate exceeds 20% safety threshold");
    }
    if (state.waitTime > 60) {
      warnings.push("CRITICAL: Wait time exceeds 60 minute safety limit");
    }
    if (state.capacity > 0.98) {
      warnings.push("WARNING: System at near-total capacity (>98%)");
    }

    return { safe: warnings.length === 0, warnings };
  }
}

let controlLog: Array<{ timestamp: string; state: SystemState; action: ControlAction; score: number }> = [];

export function runControlCycle(state: SystemState) {
  const safety = new SafetyEnvelope().validate(state);

  if (!safety.safe) {
    return {
      paused: true,
      warnings: safety.warnings,
      action: null,
      score: null
    };
  }

  const optimizer = new MultiObjectiveOptimizer();
  const scores = optimizer.score(state);

  const controller = new AdaptiveController();
  let action = controller.decide(state);
  action = new ControlPolicy().enforce(action);

  controlLog.push({
    timestamp: new Date().toISOString(),
    state,
    action,
    score: scores.overall
  });

  if (controlLog.length > 200) {
    controlLog = controlLog.slice(-200);
  }

  return {
    paused: false,
    warnings: [],
    action,
    scores,
    safety
  };
}

export function getControlLog() {
  return [...controlLog];
}

export const adaptiveController = new AdaptiveController();
export const controlPolicy = new ControlPolicy();
export const multiObjectiveOptimizer = new MultiObjectiveOptimizer();
export const safetyEnvelope = new SafetyEnvelope();
