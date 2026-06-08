// T025: The single, universal emergency disclaimer shown to patients.
// This is fixed healthcare boilerplate — NOT a condition-specific recommendation.
// It is the ONLY emergency language a patient sees before a physician signs off.
// Defined once here and appended at every patient outbound boundary.
export const EMERGENCY_DISCLAIMER =
  "If this is a medical emergency, call 911 or go to the nearest emergency room.";

/**
 * Append the universal emergency disclaimer footer to an outbound patient message.
 * Idempotent: returns the body unchanged if the footer is already present, so it is
 * safe to call at multiple boundaries without double-appending.
 */
export function appendEmergencyDisclaimer(body: string): string {
  const text = String(body ?? "").trim();
  if (!text) return text;
  if (text.includes(EMERGENCY_DISCLAIMER)) return text;
  return `${text}\n\n${EMERGENCY_DISCLAIMER}`;
}
