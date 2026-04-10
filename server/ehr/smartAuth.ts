import { fhirGet, fhirPost } from "../integrations/ehr/fhirClient";

const EPIC_ISSUER  = process.env.EPIC_ISSUER  ?? "";
const FHIR_BASE    = process.env.FHIR_BASE    ?? "";
const SMART_REDIRECT  = process.env.SMART_REDIRECT  ?? "";
const SMART_CLIENT_ID = process.env.SMART_CLIENT_ID ?? "";

export interface SmartToken {
  access_token:  string;
  token_type:    string;
  expires_in:    number;
  scope:         string;
  patient?:      string;
}

export function buildSmartLaunchUrl(opts: {
  clientId?:   string;
  redirect?:   string;
  iss?:        string;
  scope?:      string;
  launch?:     string;
}): string {
  const iss = opts.iss ?? EPIC_ISSUER;
  if (!iss) throw new Error("EPIC_ISSUER not configured");

  const url = new URL(`${iss}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id",     opts.clientId  ?? SMART_CLIENT_ID);
  url.searchParams.set("redirect_uri",  opts.redirect  ?? SMART_REDIRECT);
  url.searchParams.set("scope",         opts.scope ?? "launch openid profile user/*.read");
  if (opts.launch) url.searchParams.set("launch", opts.launch);
  return url.toString();
}

export async function exchangeCodeForToken(code: string): Promise<SmartToken> {
  const issuer = EPIC_ISSUER;
  if (!issuer) throw new Error("EPIC_ISSUER not configured");

  const res = await fetch(`${issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: SMART_REDIRECT,
      client_id:    SMART_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SMART token exchange failed ${res.status}: ${body}`);
  }
  return res.json() as Promise<SmartToken>;
}

export async function getPatientFHIR(patientId: string, token: string) {
  const base = FHIR_BASE;
  if (!base) throw new Error("FHIR_BASE not configured");
  return fhirGet(`${base}/Patient/${patientId}`, token);
}

export async function createEncounterFHIR(patientId: string, token: string, opts: {
  class?: string;
  type?:  string;
} = {}) {
  const base = FHIR_BASE;
  if (!base) throw new Error("FHIR_BASE not configured");

  const body = {
    resourceType: "Encounter",
    status:       "in-progress",
    class: {
      system:  "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code:    opts.class ?? "AMB",
      display: opts.class === "EMER" ? "Emergency" : "Ambulatory",
    },
    type: opts.type ? [{ text: opts.type }] : undefined,
    subject: { reference: `Patient/${patientId}` },
    period:  { start: new Date().toISOString() },
  };

  return fhirPost(`${base}/Encounter`, token, body);
}

export async function postObservationFHIR(
  patientId: string,
  token: string,
  obs: { code: string; value: number; unit: string; display?: string }
) {
  const base = FHIR_BASE;
  if (!base) throw new Error("FHIR_BASE not configured");

  const body = {
    resourceType: "Observation",
    status:       "final",
    subject:      { reference: `Patient/${patientId}` },
    effectiveDateTime: new Date().toISOString(),
    code: { text: obs.display ?? obs.code, coding: [{ code: obs.code }] },
    valueQuantity: { value: obs.value, unit: obs.unit },
  };

  return fhirPost(`${base}/Observation`, token, body);
}

export async function postVitalsFHIR(
  patientId: string,
  token: string,
  vitals: { systolicBp?: number; diastolicBp?: number; oxygenSaturation?: number; heartRate?: number; respiratoryRate?: number; temperature?: number }
) {
  const observations: Promise<unknown>[] = [];

  if (vitals.systolicBp != null) {
    observations.push(postObservationFHIR(patientId, token, { code: "8480-6", value: vitals.systolicBp, unit: "mmHg", display: "Systolic BP" }));
  }
  if (vitals.oxygenSaturation != null) {
    observations.push(postObservationFHIR(patientId, token, { code: "59408-5", value: vitals.oxygenSaturation, unit: "%", display: "SpO2" }));
  }
  if (vitals.heartRate != null) {
    observations.push(postObservationFHIR(patientId, token, { code: "8867-4", value: vitals.heartRate, unit: "bpm", display: "Heart Rate" }));
  }
  if (vitals.respiratoryRate != null) {
    observations.push(postObservationFHIR(patientId, token, { code: "9279-1", value: vitals.respiratoryRate, unit: "breaths/min", display: "Respiratory Rate" }));
  }
  if (vitals.temperature != null) {
    observations.push(postObservationFHIR(patientId, token, { code: "8310-5", value: vitals.temperature, unit: "°F", display: "Body Temperature" }));
  }

  return Promise.allSettled(observations);
}
