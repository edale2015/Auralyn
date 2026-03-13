import type { AssistantResult } from "./telemedicineAssistantService"

export function generateChartNoteFromResult(
  result: AssistantResult,
  patientMessage: string
): string {
  const topDx = result.differential[0]?.diagnosis ?? "Undetermined"
  const actions = result.resources.recommendedActions
    .map((a) => `• ${a.diagnosis} [${a.priority}]`)
    .join("\n") || "• Supportive care"

  return `CHIEF COMPLAINT:
${result.complaint ?? patientMessage.slice(0, 80)}

HISTORY OF PRESENT ILLNESS:
${patientMessage}

ASSESSMENT:
1. ${topDx} (confidence ${(result.differential[0]?.confidence ?? 0) * 100 | 0}%)${
    result.differential[1]
      ? `\n2. ${result.differential[1].diagnosis} (confidence ${(result.differential[1].confidence ?? 0) * 100 | 0}%)`
      : ""
  }${
    result.differential[2]
      ? `\n3. ${result.differential[2].diagnosis} (confidence ${(result.differential[2].confidence ?? 0) * 100 | 0}%)`
      : ""
  }

PLAN:
${actions}

DISPOSITION:
${result.triage.level.replace(/_/g, " ").toUpperCase()}

SAFETY ALERTS:
${result.safetyAlerts.map((a) => `⚠ ${a.message}`).join("\n") || "None"}`.trim()
}
