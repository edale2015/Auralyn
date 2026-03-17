export interface DecisionResult {
  diagnosis: string;
  disposition: "self_care" | "self_care_followup" | "urgent" | "er";
  confidence: number;
  reasoning: string;
}

export class DecisionLayer {
  decide(reasoning: any, safety: any): DecisionResult {
    if (safety?.flag && safety.level === "emergency") {
      return {
        diagnosis: reasoning?.topDiagnosis || "Emergency Assessment Required",
        disposition: "er",
        confidence: 0.95,
        reasoning: `Emergency flag: ${safety.reasons?.[0] || "critical safety concern"}`,
      };
    }

    if (safety?.flag && safety.level === "urgent") {
      return {
        diagnosis: reasoning?.topDiagnosis || "Urgent Assessment Required",
        disposition: "urgent",
        confidence: reasoning?.confidence || 0.7,
        reasoning: `Urgent flag: ${safety.reasons?.[0] || "safety concern requires evaluation"}`,
      };
    }

    const confidence = reasoning?.confidence || 0.5;
    let disposition: DecisionResult["disposition"];

    if (confidence >= 0.8) {
      disposition = "self_care";
    } else if (confidence >= 0.6) {
      disposition = "self_care_followup";
    } else {
      disposition = "urgent";
    }

    return {
      diagnosis: reasoning?.topDiagnosis || "Undetermined",
      disposition,
      confidence,
      reasoning: `Bayesian analysis: ${reasoning?.differentials?.length || 0} differentials considered`,
    };
  }
}

export const decisionLayer = new DecisionLayer();
