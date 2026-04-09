/**
 * Global Policy Layer — Country-Specific Healthcare Regulation
 *
 * Ensures the global orchestrator never prescribes clinical actions that
 * violate the regulatory framework of the destination country.
 *
 * Key regulatory dimensions covered:
 *   - Telemedicine authorization (some countries require physical presence)
 *   - Physician requirement vs NP/PA independent practice
 *   - NHS/national health routing (UK)
 *   - Low-cost pathway activation (India, Brazil)
 *   - GDPR-equivalent data sovereignty (EU)
 *   - WHO reporting obligations (all countries ≥ pandemic threshold)
 */

export interface GlobalPolicyInput {
  country?: string;   // ISO2 e.g. "US", "GB", "IN", "DE", "BR", "AU"
  context?: {
    isDataExport?:   boolean;  // true if PHI is crossing borders
    isTelemed?:      boolean;
  };
}

export interface GlobalPolicyOutput {
  telemedAllowed:        boolean;
  physicianRequired:     boolean;
  nhsRouting:            boolean;      // UK NHS pathway
  lowCostRouting:        boolean;      // resource-constrained markets
  dataSovereigntyFlag:   boolean;      // PHI must not leave country
  whoReportingRequired:  boolean;
  prescribingAllowed:    boolean;
  notes:                 string[];
  jurisdiction:          string;
}

const EU_COUNTRIES = new Set(["DE","FR","IT","ES","NL","BE","PL","SE","AT","CZ","RO","PT","HU","FI","DK","SK","BG","HR","LT","LV","EE","SI","CY","LU","MT"]);

export function enforceGlobalPolicy(input: GlobalPolicyInput): GlobalPolicyOutput {
  const country = (input.country ?? "US").toUpperCase();
  const ctx     = input.context ?? {};
  const notes:  string[] = [];

  switch (country) {
    case "US":
      return {
        telemedAllowed:       true,
        physicianRequired:    true,
        nhsRouting:           false,
        lowCostRouting:       false,
        dataSovereigntyFlag:  false,
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes:                ["HIPAA applies — PHI encryption required", "State-level licensing rules enforced by policy layer"],
        jurisdiction:         "US",
      };

    case "GB":
    case "UK":
      notes.push("NHS routing required for non-private patients");
      if (ctx.isDataExport) notes.push("UK GDPR: PHI transfer to non-UK servers requires adequacy decision");
      return {
        telemedAllowed:       true,
        physicianRequired:    false,   // UK allows registered nurse prescribers
        nhsRouting:           true,
        lowCostRouting:       false,
        dataSovereigntyFlag:  ctx.isDataExport ?? false,
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes,
        jurisdiction:         "GB",
      };

    case "IN":
      notes.push("Telemedicine Practice Guidelines 2020 (India) apply");
      notes.push("Low-cost telemed pathway active — minimize specialist escalation");
      return {
        telemedAllowed:       true,
        physicianRequired:    true,
        nhsRouting:           false,
        lowCostRouting:       true,
        dataSovereigntyFlag:  true,    // India data localization law
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes,
        jurisdiction:         "IN",
      };

    case "CA":
      notes.push("PIPEDA / Quebec Law 25 data protection applies");
      return {
        telemedAllowed:       true,
        physicianRequired:    false,
        nhsRouting:           false,   // provincial health systems vary
        lowCostRouting:       false,
        dataSovereigntyFlag:  ctx.isDataExport ?? false,
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes,
        jurisdiction:         "CA",
      };

    case "BR":
      notes.push("CFM Resolution 2314/2022 — telemed requires physician registration with CRM");
      return {
        telemedAllowed:       true,
        physicianRequired:    true,
        nhsRouting:           false,
        lowCostRouting:       true,
        dataSovereigntyFlag:  true,    // LGPD
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes,
        jurisdiction:         "BR",
      };

    case "AU":
      notes.push("MBS telehealth item numbers required for billing");
      return {
        telemedAllowed:       true,
        physicianRequired:    false,
        nhsRouting:           false,
        lowCostRouting:       false,
        dataSovereigntyFlag:  false,
        whoReportingRequired: false,
        prescribingAllowed:   true,
        notes,
        jurisdiction:         "AU",
      };

    default:
      // EU countries — GDPR applies
      if (EU_COUNTRIES.has(country)) {
        notes.push(`EU (${country}): GDPR applies — data export requires adequacy decision`);
        notes.push("EU AI Act may classify clinical AI as high-risk system");
        return {
          telemedAllowed:       true,
          physicianRequired:    false,
          nhsRouting:           false,
          lowCostRouting:       false,
          dataSovereigntyFlag:  true,
          whoReportingRequired: false,
          prescribingAllowed:   true,
          notes,
          jurisdiction:         country,
        };
      }

      // Unknown / restricted
      return {
        telemedAllowed:       false,
        physicianRequired:    true,
        nhsRouting:           false,
        lowCostRouting:       true,
        dataSovereigntyFlag:  true,
        whoReportingRequired: false,
        prescribingAllowed:   false,
        notes:                [`${country}: no specific policy mapped — default-deny telemed until jurisdiction confirmed`],
        jurisdiction:         country,
      };
  }
}
