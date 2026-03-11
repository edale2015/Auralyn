import { generateComplaintDriftAlerts } from "./complaintDriftAlerts";

export async function generateTuningSuggestionsFromReconciliations() {
  const alerts = await generateComplaintDriftAlerts();

  return alerts.map((alert) => {
    const suggestions: string[] = [];

    if (alert.failureRate > 0.2) {
      suggestions.push("Add 3 new golden cases for this complaint.");
      suggestions.push("Review complaint aliases and question bundle coverage.");
      suggestions.push("Review top differential cluster rules and disposition expressions.");
    }

    if (alert.safetyMissRate > 0.05) {
      suggestions.push("Audit red flag expressions and escalation thresholds.");
      suggestions.push("Add a mandatory consistency check gate before disposition.");
      suggestions.push("Add complaint-specific emergency return precautions review.");
    }

    return {
      complaint: alert.complaint,
      failureRate: alert.failureRate,
      safetyMissRate: alert.safetyMissRate,
      suggestions,
    };
  });
}
