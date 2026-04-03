/**
 * INTENDED USE (IFU) VALIDATOR — FDA SaMD Scope Guard
 *
 * Validates that every intake request falls within the system's cleared
 * Intended For Use (IFU). Requests outside scope are logged and rejected
 * with appropriate guidance, rather than silently processed.
 *
 * IFU Scope: Urgent care complaints for patients ≥3 months of age in an
 * outpatient or telemedicine context.
 *
 * Out-of-scope conditions that trigger IFU guard:
 *   - Patient age <3 months (neonates — require specialized ER pathway)
 *   - Mass casualty / disaster triage requests
 *   - Surgical or procedural requests (booking a procedure, not triage)
 *   - Mental health medication management (distinct from acute psychiatric triage)
 */

export interface IFUValidationResult {
  inScope: boolean;
  violations: string[];
  guidance: string;
  ageMonths?: number;
}

const OUT_OF_SCOPE_PATTERNS = [
  { pattern: /mass\s*casualty|disaster\s*triage|mci\s*triage/i, label: "Mass casualty / disaster triage" },
  { pattern: /schedule\s*surgery|book\s*procedure|pre-?op/i, label: "Surgical procedure scheduling" },
  { pattern: /medication\s*refill|prescription\s*renewal|refill\s*my\s*(medication|prescription)/i, label: "Medication refill request (not triage)" },
  { pattern: /second\s*opinion\s*on\s*treatment/i, label: "Second opinion on established treatment plan" },
];

export function validateIntendedUse(input: {
  complaint?: string;
  symptoms?: string[];
  ageYears?: number;
  ageMonths?: number;
  context?: string;
}): IFUValidationResult {
  const violations: string[] = [];

  const ageMonths =
    input.ageMonths ??
    (input.ageYears !== undefined ? input.ageYears * 12 : undefined);

  if (ageMonths !== undefined && ageMonths < 3) {
    violations.push(
      `Patient age (${ageMonths} months) is below IFU minimum of 3 months. Route to specialized neonatal/pediatric ER pathway.`,
    );
  }

  const freeText = [
    input.complaint ?? "",
    ...(input.symptoms ?? []),
    input.context ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const { pattern, label } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(freeText)) {
      violations.push(`Out-of-scope request detected: ${label}`);
    }
  }

  const inScope = violations.length === 0;

  let guidance = "Request is within IFU scope. Proceed with standard triage pipeline.";
  if (!inScope) {
    guidance = violations.includes("Patient age")
      ? "Neonate detected. Direct to emergency pediatric care. Do not process through standard triage AI."
      : "This request is outside the scope of the Auralyn triage system. Please direct the patient to the appropriate care pathway.";
  }

  return { inScope, violations, guidance, ageMonths };
}
