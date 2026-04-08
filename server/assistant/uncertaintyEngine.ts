export interface UncertaintyInput {
  subServiceFailures: string[];
  differential: Array<{ diagnosis: string; confidence: number }>;
  debate?: { disagreement?: number; consensusScore?: number };
  safetyAlerts?: Array<{ message: string; severity: string }>;
  contradictions?: Array<{ diagnosis: string; conflict: string }>;
}

export interface UncertaintyOutput {
  score: number;
  level: "low" | "medium" | "high" | "very_high";
  drivers: string[];
  recommendation: "proceed" | "requery" | "escalate";
}

export function computeUncertainty(input: UncertaintyInput): UncertaintyOutput {
  let score = 0;
  const drivers: string[] = [];

  // Sub-service failures degrade confidence
  if (input.subServiceFailures.length > 0) {
    const failurePenalty = Math.min(0.40, input.subServiceFailures.length * 0.10);
    score += failurePenalty;
    drivers.push(`service_failures(${input.subServiceFailures.join(",")})+${(failurePenalty * 100).toFixed(0)}%`);
  }

  // Empty or weak differential
  if (!input.differential.length) {
    score += 0.30;
    drivers.push("no_differential+30%");
  } else {
    const topConf = input.differential[0].confidence;
    if (topConf < 0.35) {
      score += 0.25;
      drivers.push(`very_weak_differential(${(topConf * 100).toFixed(0)}%)+25%`);
    } else if (topConf < 0.55) {
      score += 0.15;
      drivers.push(`weak_differential(${(topConf * 100).toFixed(0)}%)+15%`);
    }

    // High spread between top differentials means unclear picture
    if (input.differential.length >= 2) {
      const spread = Math.abs(input.differential[0].confidence - input.differential[1].confidence);
      if (spread < 0.10) {
        score += 0.12;
        drivers.push(`differential_too_close(spread=${(spread * 100).toFixed(0)}%)+12%`);
      }
    }
  }

  // Agent debate disagreement
  if (input.debate) {
    const disagreement = input.debate.disagreement ?? 0;
    const consensus = input.debate.consensusScore ?? 1;
    if (disagreement > 0.30) {
      score += 0.20;
      drivers.push(`high_agent_disagreement(${(disagreement * 100).toFixed(0)}%)+20%`);
    } else if (disagreement > 0.15) {
      score += 0.10;
      drivers.push(`moderate_agent_disagreement(${(disagreement * 100).toFixed(0)}%)+10%`);
    }
    if (consensus < 0.40) {
      score += 0.12;
      drivers.push(`low_consensus(${(consensus * 100).toFixed(0)}%)+12%`);
    }
  }

  // Clinical contradictions add uncertainty
  if ((input.contradictions?.length ?? 0) > 0) {
    score += 0.15;
    drivers.push(`contradictions(${input.contradictions!.length})+15%`);
  }

  // Safety alerts add uncertainty (high-stakes situation)
  if ((input.safetyAlerts?.length ?? 0) > 0) {
    score += 0.25;
    drivers.push(`safety_alerts(${input.safetyAlerts!.length})+25%`);
  }

  const finalScore = Math.min(1, Math.round(score * 1000) / 1000);
  const level: UncertaintyOutput["level"] =
    finalScore >= 0.70 ? "very_high" :
    finalScore >= 0.50 ? "high" :
    finalScore >= 0.30 ? "medium" : "low";

  const recommendation: UncertaintyOutput["recommendation"] =
    (input.safetyAlerts?.length ?? 0) > 0 ? "escalate" :
    finalScore >= 0.60 ? "requery" :
    "proceed";

  return { score: finalScore, level, drivers, recommendation };
}
