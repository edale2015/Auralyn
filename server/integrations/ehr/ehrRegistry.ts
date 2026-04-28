import type { EhrConfig, EhrConnector } from "./ehrConnector";
import { makeEcwConnector }  from "./ecwConnector";
import { makeEpicConnector } from "./epicConnector";

export function getEhrConnector(config: EhrConfig): EhrConnector {
  switch (config.vendor) {
    case "ecw":
      return makeEcwConnector(config);
    case "epic":
      return makeEpicConnector(config) as unknown as EhrConnector;
    case "athena":
      // Athena uses proprietary REST, not the EhrConnector interface.
      // Use fetchPatientContext({ vendor: "athena", ... }) from fhirPatientContext.ts directly.
      throw new Error(
        "Athena does not implement EhrConnector. " +
        "Use fetchPatientContext({ vendor: 'athena' }) from fhirPatientContext.ts"
      );
    default:
      throw new Error(`Unknown EHR vendor: ${(config as any).vendor}`);
  }
}

export function getEhrConfigFromEnv(): EhrConfig | null {
  const vendor      = process.env.EHR_VENDOR as "athena" | "ecw" | "epic" | undefined;
  const fhirBaseUrl = process.env.EHR_FHIR_BASE_URL;
  const clientId    = process.env.EHR_CLIENT_ID;
  const redirectUri = process.env.EHR_REDIRECT_URI;
  const scopes      = process.env.EHR_SCOPES || "launch/patient openid fhirUser patient/*.read";
  const allowWrites = process.env.EHR_ALLOW_WRITES === "true";

  if (!vendor || !fhirBaseUrl || !clientId || !redirectUri) {
    return null;
  }

  return {
    vendor,
    fhirBaseUrl,
    clientId,
    clientSecret: process.env.EHR_CLIENT_SECRET,
    redirectUri,
    scopes,
    allowWrites,
  };
}
