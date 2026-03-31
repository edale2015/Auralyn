import { AnswerMap, Disposition } from "../../shared/packRows";
import { planTemplates } from "../config/planTemplates";
import { db } from "../db";
import { kbPlanTemplates } from "../../shared/schema";
import { eq } from "drizzle-orm";

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

export async function generatePlanFromTemplate(
  key: string,
  finalDisposition?: Disposition,
  _answers?: AnswerMap
): Promise<GeneratedPlan | null> {
  try {
    const rows = await db
      .select()
      .from(kbPlanTemplates)
      .where(eq(kbPlanTemplates.templateKey, key))
      .limit(1);

    if (rows.length > 0) {
      const t = rows[0];
      let meds: GeneratedPlan["meds"] = [];
      if (t.medicationInstructions) {
        try { meds = JSON.parse(t.medicationInstructions); } catch { meds = []; }
      }
      return {
        key: t.templateKey,
        diagnosisLabel: t.diagnosisLabel,
        disposition: (finalDisposition || t.defaultDisposition) as Disposition,
        summary: t.summary || "",
        homeCare: t.homeCare || [],
        meds,
        followUp: t.followUp || [],
        returnPrecautions: t.returnPrecautions || [],
        patientMessage: t.patientMessage || "",
      };
    }
  } catch {
    // fall through to hardcoded fallback
  }

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
