/**
 * oversightAgent.ts
 * AI watching AI — the safety supervisor that sits above the clinical brain
 * and evaluates whether its output can be trusted.
 *
 * Checks performed on every brain run:
 *   1. Model disagreement   — diagnostic vs risk agent confidence gap > 0.4
 *   2. Very high uncertainty — uncertainty > 0.8 signals unreliable output
 *   3. Engine failure cluster — 4+ engines failed in one call
 *   4. Data/concept drift   — Redis flag "drift:flag" = "true"
 *   5. Empty differential   — brain returned no diagnostic hypotheses
 *   6. Confidence collapse  — all differentials below 0.05 probability
 *
 * When shouldEscalate() returns true, the brain engine forces
 * disposition = "physician_required" before returning its output.
 *
 * Alerts are included in the brain output under `oversightAlerts`.
 */

import { getRedisAsync } from "../queue/redis";

export interface OversightAlert {
  type:     string;
  severity: "low" | "medium" | "high";
  message:  string;
}

export interface OversightContext {
  uncertainty?:        number;
  engineFailures?:     { engine: string }[];
  differentials?:      { probability?: number; posteriorProbability?: number }[];
  diagnosticConfidence?: number;
  riskConfidence?:      number;
  riskScore?:           number | null;
  redFlags?:            string[];
}

export class OversightAgent {

  async evaluate(ctx: OversightContext): Promise<OversightAlert[]> {
    const alerts: OversightAlert[] = [];

    const uncertainty    = ctx.uncertainty     ?? 0;
    const failures       = ctx.engineFailures  ?? [];
    const differentials  = ctx.differentials   ?? [];
    const diagConf       = ctx.diagnosticConfidence;
    const riskConf       = ctx.riskConfidence;

    if (diagConf !== undefined && riskConf !== undefined) {
      const gap = Math.abs(diagConf - riskConf);
      if (gap > 0.4) {
        alerts.push({
          type:     "model_disagreement",
          severity: "high",
          message:  `Diagnostic vs risk confidence gap: ${gap.toFixed(2)} — result may be unreliable`,
        });
      }
    }

    if (uncertainty > 0.8) {
      alerts.push({
        type:     "very_high_uncertainty",
        severity: "high",
        message:  `Uncertainty score ${uncertainty.toFixed(2)} exceeds safe threshold — physician review mandatory`,
      });
    } else if (uncertainty > 0.65) {
      alerts.push({
        type:     "elevated_uncertainty",
        severity: "medium",
        message:  `Uncertainty score ${uncertainty.toFixed(2)} — additional information recommended`,
      });
    }

    if (failures.length >= 4) {
      alerts.push({
        type:     "engine_failure_cluster",
        severity: "high",
        message:  `${failures.length} engines failed in this run: ${failures.map((f) => f.engine).join(", ")}`,
      });
    } else if (failures.length >= 2) {
      alerts.push({
        type:     "engine_failure_cluster",
        severity: "medium",
        message:  `${failures.length} engines failed — output partially degraded`,
      });
    }

    try {
      const redis = await getRedisAsync();
      if (redis && typeof redis.get === "function") {
        const drift = await redis.get("drift:flag");
        if (drift === "true") {
          alerts.push({
            type:     "data_drift",
            severity: "medium",
            message:  "Feature distribution drift detected — model outputs may be shifted",
          });
        }
      }
    } catch {
    }

    if (differentials.length === 0) {
      alerts.push({
        type:     "empty_differential",
        severity: "high",
        message:  "No diagnostic hypotheses generated — physician evaluation required",
      });
    } else {
      const maxProb = Math.max(
        ...differentials.map((d) => d.posteriorProbability ?? d.probability ?? 0),
      );
      if (maxProb < 0.05) {
        alerts.push({
          type:     "confidence_collapse",
          severity: "high",
          message:  `All differentials below 5% probability (max: ${(maxProb * 100).toFixed(1)}%) — inconclusive`,
        });
      }
    }

    const criticalRedFlags = (ctx.redFlags ?? []).filter((f) =>
      /chest\s*pain|stroke|seizure|anaphylaxis|sepsis|suicid/i.test(f),
    );
    if (criticalRedFlags.length > 0 && (ctx.riskScore ?? 0) < 0.7) {
      alerts.push({
        type:     "red_flag_risk_mismatch",
        severity: "high",
        message:  `Critical red flags present but risk score is low — verify risk stratification`,
      });
    }

    return alerts;
  }

  async shouldEscalate(alerts: OversightAlert[]): Promise<boolean> {
    return alerts.some((a) => a.severity === "high");
  }

  /**
   * Sets the drift flag in Redis — called by external drift-detection pipelines.
   */
  async flagDrift(detected: boolean): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (redis && typeof redis.set === "function") {
        await redis.set("drift:flag", detected ? "true" : "false");
      }
    } catch {
    }
  }
}

export const oversightAgent = new OversightAgent();
