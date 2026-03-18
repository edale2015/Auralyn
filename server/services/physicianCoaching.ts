export type CoachingInput = {
  physicianId: string;
  avgReviewTimeSeconds: number;
  overrideRate: number;
  avgSatisfaction: number;
  highRiskHandled: number;
};

export function buildPhysicianCoaching(input: CoachingInput) {
  const tips: string[] = [];
  if (input.avgReviewTimeSeconds > 30) tips.push("Review time is high. Increase batch-review usage for low-risk cases.");
  if (input.overrideRate > 0.12) tips.push("Override rate elevated. Revisit reasoning traces and complaint-specific logic.");
  if (input.avgSatisfaction < 4.4) tips.push("Satisfaction below target. Improve communication and disposition explanation clarity.");
  if (input.highRiskHandled < 3) tips.push("Limited high-risk exposure. Consider supervised escalation review training.");
  if (!tips.length) tips.push("Performance strong. Continue current review patterns.");
  return { physicianId: input.physicianId, tips };
}
