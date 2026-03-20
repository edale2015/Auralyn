import { sendSMS } from "../services/smsService";

export interface AutoCarePlan {
  phone?: string;
  followUp?: string;
  medication?: string;
  instructions?: string[];
  patientId?: string;
}

export async function executeAutonomousCare(plan: AutoCarePlan): Promise<{ executed: string[] }> {
  const executed: string[] = [];

  if (plan.medication) {
    console.log(JSON.stringify({
      event: "autonomous_medication_suggestion",
      patientId: plan.patientId,
      medication: plan.medication,
      timestamp: new Date().toISOString(),
    }));
    executed.push(`medication_logged:${plan.medication}`);
  }

  if (plan.instructions?.length) {
    for (const instruction of plan.instructions) {
      console.log(JSON.stringify({
        event: "autonomous_care_instruction",
        patientId: plan.patientId,
        instruction,
      }));
    }
    executed.push(`instructions:${plan.instructions.length}`);
  }

  if (plan.phone && plan.followUp) {
    const result = await sendSMS(plan.phone, plan.followUp);
    executed.push(`sms:${result.success ? "sent" : "failed"}`);
  }

  return { executed };
}
