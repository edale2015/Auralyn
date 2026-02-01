import type { EhrConfig, EhrConnector } from "./ehrConnector";
import { makeEcwConnector } from "./ecwConnector";

export function getEhrConnector(config: EhrConfig): EhrConnector {
  if (config.vendor === "ecw") return makeEcwConnector(config);
  if (config.vendor === "athena") {
    throw new Error("Athena connector not wired in this stub");
  }
  throw new Error("Unknown EHR vendor");
}

export function getEhrConfigFromEnv(): EhrConfig | null {
  const vendor = process.env.EHR_VENDOR as "athena" | "ecw" | undefined;
  const fhirBaseUrl = process.env.EHR_FHIR_BASE_URL;
  const clientId = process.env.EHR_CLIENT_ID;
  const redirectUri = process.env.EHR_REDIRECT_URI;
  const scopes = process.env.EHR_SCOPES || "launch/patient openid fhirUser patient/*.read";
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
    allowWrites
  };
}
