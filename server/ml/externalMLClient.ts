import type { RawInput } from "./featureStore";
import { buildFeatures } from "./featureStore";
import { predictAdmission } from "./admissionModel";
import { retryWithJitter } from "../performance/latencyBudget";

export interface ExternalMLResult {
  probability: number;
  risk:        "low" | "medium" | "high";
  source:      "external" | "fallback";
}

const ML_URL = () => process.env.ML_URL ?? "";

function isConfigured(): boolean {
  return ML_URL().length > 0;
}

export async function predictML(input: RawInput): Promise<ExternalMLResult> {
  if (!isConfigured()) {
    const r = predictAdmission(input);
    return { probability: r.probability, risk: r.risk, source: "fallback" };
  }

  const features = buildFeatures(input);

  try {
    const result = await retryWithJitter(async () => {
      const res = await fetch(`${ML_URL()}/predict`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(features),
      });
      if (!res.ok) throw new Error(`ML service returned ${res.status}`);
      return res.json() as Promise<{ probability: number }>;
    }, { maxAttempts: 2, baseDelayMs: 100 });

    const p = result.probability;
    return {
      probability: p,
      risk:        p > 0.7 ? "high" : p > 0.4 ? "medium" : "low",
      source:      "external",
    };
  } catch (err: any) {
    console.warn(`[ExternalML] Falling back to in-process model: ${err.message}`);
    const r = predictAdmission(input);
    return { probability: r.probability, risk: r.risk, source: "fallback" };
  }
}

export function getMLServiceStatus(): { configured: boolean; url: string | null } {
  const configured = isConfigured();
  return { configured, url: configured ? ML_URL() : null };
}
