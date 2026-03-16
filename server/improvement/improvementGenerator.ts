import { WeaknessDetection } from "./weaknessDetector";

export interface ImprovementSuggestion {
  action: "add_question" | "add_engine" | "tune_engine" | "add_similarity_training" | "review_protocol" | "add_red_flag_rule";
  suggestion: string;
  engine?: string;
  priority: "critical" | "high" | "moderate" | "low";
  estimatedImpact: string;
  weaknessType: string;
}

export function generateImprovements(weaknesses: WeaknessDetection[]): ImprovementSuggestion[] {
  const improvements: ImprovementSuggestion[] = [];

  weaknesses.forEach(w => {
    switch (w.type) {
      case "red_flag_detection":
        improvements.push({
          action: "add_red_flag_rule",
          suggestion: "Add dedicated red flag pattern detector for missed emergency presentations",
          engine: "redFlagEngine",
          priority: "critical",
          estimatedImpact: "Reduce missed ER cases by ~60%",
          weaknessType: w.type,
        });
        improvements.push({
          action: "add_question",
          suggestion: "Inject mandatory red flag screening question at conversation start",
          engine: "nextQuestionSelector",
          priority: "critical",
          estimatedImpact: "Catch red flags earlier in conversation",
          weaknessType: w.type,
        });
        break;

      case "triage_accuracy":
        improvements.push({
          action: "add_question",
          suggestion: "Add severity scale question (1–10) to improve disposition calibration",
          engine: "nextQuestionSelector",
          priority: w.severity === "high" ? "high" : "moderate",
          estimatedImpact: "+8–12% disposition accuracy",
          weaknessType: w.type,
        });
        improvements.push({
          action: "tune_engine",
          suggestion: "Recalibrate confidence thresholds in bayesianDifferential engine",
          engine: "bayesianDifferential",
          priority: "moderate",
          estimatedImpact: "+5% overall accuracy",
          weaknessType: w.type,
        });
        break;

      case "diagnostic_reasoning":
        improvements.push({
          action: "add_similarity_training",
          suggestion: "Increase training data for similarityEngine differential reasoning",
          engine: "similarityEngine",
          priority: "moderate",
          estimatedImpact: "+10–15% diagnosis match rate",
          weaknessType: w.type,
        });
        improvements.push({
          action: "add_engine",
          suggestion: "Deploy rare disease safety net engine for differential broadening",
          priority: "low",
          estimatedImpact: "Reduce diagnostic blind spots",
          weaknessType: w.type,
        });
        break;

      case "overall_score":
        improvements.push({
          action: "review_protocol",
          suggestion: "Review clinical protocol alignment against latest guidelines",
          priority: "low",
          estimatedImpact: "+3–5 average score points",
          weaknessType: w.type,
        });
        break;
    }
  });

  return improvements;
}
