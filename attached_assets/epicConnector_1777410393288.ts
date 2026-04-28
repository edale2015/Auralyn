/**
 * epicConnector.ts
 * Drop into: server/integrations/ehr/epicConnector.ts
 *
 * Epic EhrConnector implementation.
 * Clones the SMART on FHIR auth pattern from ecwConnector.ts exactly.
 *
 * Auth status: SKELETON
 *   - SMART configuration discovery: ✅ built
 *   - Authorization URL builder (PKCE-ready): ✅ built
 *   - Token exchange: ✅ built
 *   - getPatient / getClinicalSnapshot: ✅ built (delegates to fhirPatientContext)
 *   - postDocumentReference / postNoteDraft: ✅ built
 *
 * To activate in production:
 *   1. Register your app at https://fhir.epic.com/developer/apps
 *   2. Set env vars: EPIC_FHIR_BASE, EPIC_CLIENT_ID, EPIC_CLIENT_SECRET (optional for public)
 *   3. Add "epic" to getEhrConnector() in ehrRegistry.ts (patch below)
 *
 * For sandbox testing:
 *   EPIC_FHIR_BASE=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 *   EPIC_CLIENT_ID=your-non-prod-client-id
 */

import { EhrConfig, EhrConnector } from "./types";
import { fetchPatientContext }       from "./fhirPatientContext";
import crypto                         from "crypto";

// ─── PKCE helpers (same pattern as ecwConnector) ──────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── Epic connector factory ───────────────────────────────────────────────────

export function makeEpicConnector(config: EhrConfig): EhrConnector {
  const fhirBase   = config.fhirBaseUrl ?? process.env.EPIC_FHIR_BASE ?? "";
  const clientId   = config.clientId    ?? process.env.EPIC_CLIENT_ID ?? "";
  const clientSecret = config.clientSecret ?? process.env.EPIC_CLIENT_SECRET;

  if (!fhirBase) {
    console.warn("[Epic] EPIC_FHIR_BASE not set — connector will return errors");
  }

  return {
    vendor: "epic",

    // ── SMART configuration discovery ─────────────────────────────────────────
    async getSmartConfiguration() {
      const url = `${fhirBase}/.well-known/smart-configuration`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Epic SMART config fetch failed: HTTP ${res.status}`);
      return res.json();
    },

    // ── Authorization URL builder (PKCE) ──────────────────────────────────────
    buildAuthorizeUrl(state: string, launch?: string) {
      const smartConfig = `${fhirBase}/.well-known/smart-configuration`;
      // In production, call getSmartConfiguration() first to get authorization_endpoint.
      // For skeleton, use the standard Epic OAuth2 endpoint pattern.
      const authEndpoint = fhirBase.replace("/api/FHIR/R4", "/oauth2/authorize");

      const codeVerifier  = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const params = new URLSearchParams({
        response_type:          "code",
        client_id:              clientId,
        redirect_uri:           process.env.EHR_REDIRECT_URI ?? "http://localhost:3000/auth/epic/callback",
        scope:                  "openid fhirUser patient/Patient.read patient/MedicationRequest.read patient/AllergyIntolerance.read patient/Condition.read patient/Observation.read",
        state,
        code_challenge:         codeChallenge,
        code_challenge_method:  "S256",
        ...(launch ? { launch, aud: fhirBase } : {}),
      });

      // Return verifier alongside URL so caller can store it in session
      return {
        url:          `${authEndpoint}?${params.toString()}`,
        codeVerifier, // store in session keyed by state
      };
    },

    // ── Token exchange ────────────────────────────────────────────────────────
    async exchangeCodeForToken(code: string, codeVerifier?: string) {
      const tokenEndpoint = fhirBase.replace("/api/FHIR/R4", "/oauth2/token");

      const body = new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: process.env.EHR_REDIRECT_URI ?? "http://localhost:3000/auth/epic/callback",
        client_id:    clientId,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      // Confidential clients include client_secret via Basic auth
      if (clientSecret) {
        const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
      }

      const res = await fetch(tokenEndpoint, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Epic token exchange failed: HTTP ${res.status} — ${text}`);
      }

      return res.json();
      // Returns: { access_token, token_type, expires_in, scope, patient, ... }
    },

    // ── Clinical data reads ───────────────────────────────────────────────────
    async getPatient(patientId: string, accessToken: string) {
      const ctx = await fetchPatientContext({
        vendor:      "epic",
        patientId,
        accessToken,
        fhirBase,
      });
      return ctx.demographics;
    },

    async getClinicalSnapshot(patientId: string, accessToken: string) {
      const ctx = await fetchPatientContext({
        vendor:      "epic",
        patientId,
        accessToken,
        fhirBase,
      });
      return ctx;
    },

    // ── Document write-back ───────────────────────────────────────────────────
    async postDocumentReference(
      patientId:   string,
      encounterId: string,
      accessToken: string,
      doc:         { title: string; content: string; mimeType?: string }
    ) {
      const body = {
        resourceType: "DocumentReference",
        status:       "current",
        type: {
          coding: [{
            system:  "http://loinc.org",
            code:    "11506-3",
            display: "Progress note",
          }],
        },
        subject:   { reference: `Patient/${patientId}` },
        context:   { encounter: [{ reference: `Encounter/${encounterId}` }] },
        content: [{
          attachment: {
            contentType: doc.mimeType ?? "text/plain",
            data:        Buffer.from(doc.content).toString("base64"),
            title:       doc.title,
          },
        }],
      };

      const res = await fetch(`${fhirBase}/DocumentReference`, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/fhir+json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Epic DocumentReference POST failed: HTTP ${res.status}`);
      return res.json();
    },

    async postNoteDraft(
      patientId:   string,
      encounterId: string,
      accessToken: string,
      noteText:    string
    ) {
      return this.postDocumentReference(patientId, encounterId, accessToken, {
        title:   "Auralyn AI Draft Note",
        content: noteText,
      });
    },
  };
}
