/**
 * SMART on FHIR Full Launch Flow — EPIC-compatible
 *
 * Implements both legs of the SMART App Launch Framework v1.0 / v2.0:
 *  1. buildAuthUrl()   — Step 1: redirect the browser to the EHR authorization endpoint
 *  2. exchangeCode()   — Step 2: server-side code→token exchange
 *
 * Set these environment variables:
 *   FHIR_BASE_URL        — e.g. https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 *   FHIR_CLIENT_ID       — registered client ID in the EHR app portal
 *   FHIR_REDIRECT_URI    — your callback URL, e.g. https://yourapp.com/fhir/callback
 *   FHIR_SCOPE           — space-delimited scopes, default: "launch patient/*.read openid profile"
 */

export interface SmartTokenResponse {
  access_token:   string;
  token_type:     string;
  expires_in:     number;
  scope:          string;
  patient?:       string;
  encounter?:     string;
  id_token?:      string;
  refresh_token?: string;
}

export interface SmartLaunchConfig {
  iss:          string;
  launch?:      string;
  state?:       string;
  additionalScope?: string;
}

/**
 * Step 1 — Build the authorization URL to redirect the user's browser to.
 *
 * @param config.iss    — Issuer URL (provided by EHR in ?iss= query param)
 * @param config.launch — Opaque launch token (provided by EHR in ?launch= query param)
 * @param config.state  — CSRF state token (generate via crypto.randomUUID())
 */
export function buildAuthUrl(config: SmartLaunchConfig): string {
  const clientId     = process.env.FHIR_CLIENT_ID     || "";
  const redirectUri  = process.env.FHIR_REDIRECT_URI  || "";
  const baseScope    = process.env.FHIR_SCOPE || "launch patient/*.read openid profile";
  const scope        = config.launch
    ? `${baseScope} launch`
    : baseScope;
  const effectiveScope = config.additionalScope
    ? `${scope} ${config.additionalScope}`
    : scope;

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         effectiveScope,
    aud:           config.iss,
    state:         config.state || "auralyn-state",
  });

  if (config.launch) params.set("launch", config.launch);

  return `${config.iss}/authorize?${params.toString()}`;
}

/**
 * Step 2 — Exchange the authorization code for tokens.
 * Call this in your /fhir/callback route handler.
 */
export async function exchangeCode(
  code: string,
  iss: string
): Promise<SmartTokenResponse> {
  const clientId    = process.env.FHIR_CLIENT_ID    || "";
  const redirectUri = process.env.FHIR_REDIRECT_URI || "";
  const tokenUrl    = `${iss}/token`;

  const body = new URLSearchParams({
    grant_type:   "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id:    clientId,
  });

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMART token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<SmartTokenResponse>;
}

export function isSmartLaunchConfigured(): boolean {
  return Boolean(
    process.env.FHIR_BASE_URL &&
    process.env.FHIR_CLIENT_ID &&
    process.env.FHIR_REDIRECT_URI
  );
}
