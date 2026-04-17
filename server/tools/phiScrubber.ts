/**
 * server/tools/phiScrubber.ts — Redact PHI patterns before export
 *
 * Catches: SSNs, DOBs, MRNs, phone numbers, and common PHI identifiers.
 * Applied after secretScrubber.
 *
 * NOTE: This is a best-effort static scrubber. Do not use for actual
 * de-identification of patient data — that requires NLP + context.
 */

const PHI_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                   label: "SSN" },
  { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g,                  label: "DOB" },
  { pattern: /\bMRN[:\s]*[A-Z0-9]{4,}\b/gi,               label: "MRN" },
  { pattern: /\b\d{10}\b/g,                                label: "PHONE_10D" },
  { pattern: /\(\d{3}\)\s*\d{3}[-.\s]\d{4}/g,             label: "PHONE_US" },
  { pattern: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,          label: "PHONE_DASHES" },
  { pattern: /[Pp]atient\s+[Nn]ame\s*:\s*[A-Z][a-z]+ [A-Z][a-z]+/g, label: "PATIENT_NAME" },
];

export function scrubPHI(content: string): string {
  let result = content;
  for (const { pattern, label } of PHI_PATTERNS) {
    result = result.replace(pattern, `[REDACTED_PHI:${label}]`);
  }
  return result;
}
