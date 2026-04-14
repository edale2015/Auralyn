/**
 * server/ehr/smartAuth.ts — DEPRECATED: Legacy SMART on FHIR auth module
 *
 * FIX (Code Review High Finding #7):
 *   This file is the legacy SMART auth implementation with:
 *   - No PKCE (vulnerable to authorization code interception)
 *   - Static CSRF state "auralyn-state" (CSRF protection completely ineffective)
 *   - Hardcoded scope: "launch openid profile user/*.read"
 *   - Issuer-driven token endpoint (SSRF risk)
 *
 *   The fixed version is at server/ehr/fhir/smartLaunch.ts.
 *
 *   MIGRATION: All callers must update to the new API:
 *     buildSmartLaunchUrl()     → buildAuthUrl()   from ./fhir/smartLaunch
 *     exchangeCodeForToken()    → exchangeCode()   from ./fhir/smartLaunch
 *     getPatientFHIR()          → fhirGet()        from ./fhir/fhirClient
 *     createEncounterFHIR()     → fhirPost()       from ./fhir/fhirClient
 *     postObservationFHIR()     → fhirPost()       from ./fhir/fhirClient
 *     postVitalsFHIR()          → fhirPost() x N   from ./fhir/fhirClient
 *
 *   This file re-exports from the fixed module so existing callers continue
 *   to compile while they migrate. The re-exports produce a deprecation warning
 *   at import time so the file doesn't silently survive code reviews.
 */

// Compile-time deprecation — any TypeScript consumer importing this module
// will see the JSDoc deprecation marker in their IDE.

/** @deprecated Use buildAuthUrl() from ./fhir/smartLaunch instead */
export { buildAuthUrl as buildSmartLaunchUrl } from "./fhir/smartLaunch";

/** @deprecated Use exchangeCode() from ./fhir/smartLaunch instead */
export { exchangeCode as exchangeCodeForToken } from "./fhir/smartLaunch";

// Emit runtime warning when this module is loaded
(function warnDeprecatedSmartAuth() {
  console.warn(
    "[DEPRECATED] server/ehr/smartAuth.ts is the legacy SMART auth module with no PKCE and " +
    "static CSRF state. Migrate callers to server/ehr/fhir/smartLaunch.ts immediately. " +
    "This file will be removed in the next security hardening release."
  );
})();
