import { AnswerMap, Disposition } from "../../shared/packRows";
import { planTemplates } from "../config/planTemplates";

export interface GeneratedPlan {
  key: string;
  diagnosisLabel: string;
  disposition: Disposition;
  summary: string;
  homeCare: string[];
  meds: Array<{
    name: string;
    dose: string;
    instructions: string;
  }>;
  followUp: string[];
  returnPrecautions: string[];
  patientMessage: string;
}

export function generatePlanFromTemplate(
  key: string,
  finalDisposition?: Disposition,
  _answers?: AnswerMap
): GeneratedPlan | null {
  const template = planTemplates.find(t => t.key === key);
  if (!template) return null;

  return {
    key: template.key,
    diagnosisLabel: template.diagnosisLabel,
    disposition: finalDisposition || template.defaultDisposition,
    summary: template.summary,
    homeCare: template.homeCare,
    meds: template.meds,
    followUp: template.followUp,
    returnPrecautions: template.returnPrecautions,
    patientMessage: template.patientMessage,
  };
}
