/**
 * server/ehr/fhir/smartLaunch.ts — SMART on FHIR launch flow
 *
 * FIXES (Code Review Issues #9, #10, #11):
 *
 *   Issue #9 — Static CSRF state:
 *     buildAuthUrl() defaulted to the hardcoded string "auralyn-state" when
 *     config.state was not provided. This makes CSRF protection entirely useless —
 *     any CSRF attack can include the known static state value. Fixed: if no state
 *     is provided, one is generated via crypto.randomUUID(). Callers SHOULD generate
 *     state server-side and store it in the user's session before the redirect.
 *
 *   Issue #10 — Issuer-driven token endpoint (SSRF risk):
 *     exchangeCode() posted to `${iss}/token` where `iss` came directly from the
 *     caller. An attacker controlling the `iss` parameter could redirect the token
 *     exchange to an arbitrary endpoint — a classic SSRF vector and token hijack.
 *     Fixed: iss is validated against an allowlist (FHIR_ALLOWED_ISSUERS env var)
 *     before the request is made. Unknown issuers are rejected with an error.
 *
 *   Issue #11 — SMART incomplete (no PKCE, no nonce):
 *     SMART App Launch Framework v2.0 requires PKCE (Proof Key for Code Exchange)
 *     for public clients. Without PKCE, authorization codes are vulnerable to
 *     interception. Fixed: buildAuthUrl() generates a code_verifier (S256 method)
 *     and includes code_challenge in the authorization URL. exchangeCode() accepts
 *     the matching code_verifier and includes it in the token exchange.
 *     The code_verifier must be stored server-side (in the user session) between
 *     Step 1 and Step 2.
 *
 * Environment variables required:
 *   FHIR_BASE_URL         — e.g. https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 *   FHIR_CLIENT_ID        — registered client ID in the EHR app portal
 *   FHIR_REDIRECT_URI     — your callback URL, e.g. https://yourapp.com/fhir/callback
 *   FHIR_SCOPE            — space-delimited scopes (default: "launch patient/*.read openid profile")
 *   FHIR_ALLOWED_ISSUERS  — comma-separated list of allowed SMART issuer base URLs
 */

import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  iss:              string;
  launch?:          string;
  /** State should be generated server-side and stored in session. If omitted, one is auto-generated. */
  state?:           string;
  additionalScope?: string;
}

/** Result of buildAuthUrl — caller must store codeVerifier and state in the user's session */
export interface SmartAuthUrlResult {
  authUrl:      string;
  state:        string;    // must be stored server-side and verified on callback
  codeVerifier: string;    // must be stored server-side and sent in exchangeCode()
}

// ── Issuer allowlist (Issue #10 FIX) ─────────────────────────────────────────

function getAllowedIssuers(): string[] {
  const raw = process.env.FHIR_ALLOWED_ISSUERS ?? "";
  const issuers = raw.split(",").map(s => s.trim()).filter(Boolean);
  return issuers;
}

function validateIssuer(iss: string): void {
  const allowed = getAllowedIssuers();

  if (allowed.length === 0) {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      throw new Error(
        "FATAL: FHIR_ALLOWED_ISSUERS is not configured. " +
        "Set a comma-separated list of allowed SMART issuer base URLs before enabling SMART launch."
      );
    }
    // Dev: warn but continue to not block development workflow
    console.warn("[SmartLaunch] FHIR_ALLOWED_ISSUERS not set — issuer not validated (non-production).");
    return;
  }

  const issNormalized = iss.replace(/\/$/, "");
  const isAllowed = allowed.some(a => issNormalized === a.replace(/\/$/, ""));

  if (!isAllowed) {
    throw new Error(
      `SMART issuer '${iss}' is not in the FHIR_ALLOWED_ISSUERS allowlist. ` +
      `Allowed: ${allowed.join(", ")}`
    );
  }
}

// ── PKCE helpers (Issue #11 FIX) ──────────────────────────────────────────────

function generateCodeVerifier(): string {
  // RFC 7636 §4.1: code_verifier = 43–128 char URL-safe string
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  // S256 method: BASE64URL(SHA256(ASCII(code_verifier)))
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ── Step 1 — Build authorization URL ─────────────────────────────────────────

export function buildAuthUrl(config: SmartLaunchConfig): SmartAuthUrlResult {
  // Validate issuer against allowlist before building the URL
  validateIssuer(config.iss);

  const clientId    = process.env.FHIR_CLIENT_ID    || "";
  const redirectUri = process.env.FHIR_REDIRECT_URI || "";
  const baseScope   = process.env.FHIR_SCOPE || "launch patient/*.read openid profile";
  const scope       = config.launch ? `${baseScope} launch` : baseScope;
  const effectiveScope = config.additionalScope ? `${scope} ${config.additionalScope}` : scope;

  // Issue #9 FIX: generate cryptographically random state if not provided
  // Callers should generate this themselves and store it in the user's session.
  const state = config.state ?? crypto.randomUUID();

  if (!config.state) {
    console.warn(
      "[SmartLaunch] state not provided to buildAuthUrl — auto-generated. " +
      "For production, generate state server-side and store it in the user session before redirecting."
    );
  }

  // Issue #11 FIX: generate PKCE code_verifier and code_challenge
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type:          "code",
    client_id:              clientId,
    redirect_uri:           redirectUri,
    scope:                  effectiveScope,
    aud:                    config.iss,
    state,
    code_challenge:         codeChallenge,   // PKCE
    code_challenge_method:  "S256",          // PKCE S256
  });

  if (config.launch) params.set("launch", config.launch);

  return {
    authUrl:      `${config.iss}/authorize?${params.toString()}`,
    state,
    codeVerifier,  // must be stored in session; sent in exchangeCode()
  };
}

// ── Step 2 — Exchange code for tokens ────────────────────────────────────────

export async function exchangeCode(
  code:         string,
  iss:          string,
  codeVerifier: string,   // Issue #11 FIX: required for PKCE verification
): Promise<SmartTokenResponse> {
  // Issue #10 FIX: validate iss before posting to it
  validateIssuer(iss);

  const clientId    = process.env.FHIR_CLIENT_ID    || "";
  const redirectUri = process.env.FHIR_REDIRECT_URI || "";

  // Use the allowlisted issuer to construct the token URL — not the raw iss string
  const tokenUrl = `${iss.replace(/\/$/, "")}/token`;

  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    code_verifier: codeVerifier,   // PKCE: verifier proves we initiated the auth request
  });

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMART token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<SmartTokenResponse>;
}

// ── Configuration check ───────────────────────────────────────────────────────

export function isSmartLaunchConfigured(): boolean {
  return Boolean(
    process.env.FHIR_BASE_URL &&
    process.env.FHIR_CLIENT_ID &&
    process.env.FHIR_REDIRECT_URI
  );
}
