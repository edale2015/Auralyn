export interface PricingInput {
  basePrice: number;
  demandLevel: number;
  capacityUtilization: number;
  payerType: "cash" | "insurance";
  timeOfDay?: "peak" | "off_peak" | "normal";
}

export interface PricingResult {
  finalPrice: number;
  basePrice: number;
  multiplier: number;
  adjustments: string[];
}

export function calculateDynamicPrice(input: PricingInput): PricingResult {
  let multiplier = 1.0;
  const adjustments: string[] = [];

  if (input.demandLevel > 0.85) {
    multiplier *= 1.3;
    adjustments.push("High demand surge (+30%)");
  } else if (input.demandLevel > 0.7) {
    multiplier *= 1.2;
    adjustments.push("Elevated demand (+20%)");
  } else if (input.demandLevel < 0.2) {
    multiplier *= 0.8;
    adjustments.push("Low demand discount (-20%)");
  } else if (input.demandLevel < 0.3) {
    multiplier *= 0.85;
    adjustments.push("Below average demand (-15%)");
  }

  if (input.capacityUtilization > 0.9) {
    multiplier *= 1.2;
    adjustments.push("Near capacity premium (+20%)");
  } else if (input.capacityUtilization > 0.8) {
    multiplier *= 1.15;
    adjustments.push("High utilization (+15%)");
  }

  if (input.payerType === "cash") {
    multiplier *= 1.1;
    adjustments.push("Cash/self-pay rate (+10%)");
  }

  if (input.timeOfDay === "peak") {
    multiplier *= 1.1;
    adjustments.push("Peak hours (+10%)");
  } else if (input.timeOfDay === "off_peak") {
    multiplier *= 0.9;
    adjustments.push("Off-peak discount (-10%)");
  }

  multiplier = Math.round(multiplier * 100) / 100;
  const finalPrice = Math.round(input.basePrice * multiplier);

  return { finalPrice, basePrice: input.basePrice, multiplier, adjustments };
}
