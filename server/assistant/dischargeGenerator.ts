import type { AssistantResult } from "./telemedicineAssistantService"

export function generateDischargeFromResult(
  result: AssistantResult,
  patientName?: string
): string {
  const greeting = patientName ? `Hi ${patientName},` : "Hi,"
  const topDx = result.differential[0]?.diagnosis ?? "your reported symptoms"
  const actions = result.resources.recommendedActions
    .map((a) => `• ${a.diagnosis}`)
    .join("\n") || "• Rest and supportive care as discussed"

  const returnNow = result.safetyAlerts
    .filter((a) => a.severity === "critical")
    .map((a) => `• ${a.message}`)
    .join("\n")

  return `${greeting}

Thank you for your visit today. Based on our assessment, your symptoms are most consistent with:

  ${topDx}

RECOMMENDED CARE:
${actions}

RETURN IMMEDIATELY IF:
• Severe shortness of breath or difficulty breathing
• Severe chest pain or pressure
• High fever not responding to medication
• Symptoms rapidly worsening${returnNow ? "\n" + returnNow : ""}

Follow up with your physician as advised if symptoms persist or worsen.

Take care,
Your Care Team`.trim()
}
