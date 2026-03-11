import { SkillContext } from "../skills/shared/skillTypes";

export type DischargeInstructionBlock = {
  summary: string;
  homeCare: string[];
  followUp: string[];
  returnPrecautions: string[];
};

export function buildDischargeInstructionBlock(
  context: SkillContext
): DischargeInstructionBlock {
  const assessmentPlan = context.priorSkillOutputs?.generate_assessment_plan?.result ?? {};

  return {
    summary: assessmentPlan.assessment ?? "Continue monitoring symptoms.",
    homeCare: assessmentPlan.plan ?? [],
    followUp: assessmentPlan.follow_up ?? [],
    returnPrecautions: assessmentPlan.return_precautions ?? [],
  };
}
