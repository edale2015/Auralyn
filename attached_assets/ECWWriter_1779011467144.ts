/**
 * AURALYN — eClinicalWorks EHR Writer
 *
 * eCW uses FHIR R4 via the eCW FHIR Developer Portal (fhir.eclinicalworks.com)
 * for provider-facing and backend integrations.
 *
 * IMPORTANT REAL-WORLD NOTES (from current 2026 integration research):
 *
 * 1. eCW's FHIR R4 implementation is certified but PARTIAL.
 *    Not all FHIR resources are supported. Some workflows still require
 *    eCW's proprietary API alongside FHIR. Always check the CapabilityStatement
 *    first: GET /fhir/r4/metadata — it tells you what the server actually supports.
 *
 * 2. Registration is through eCW App Orchard (not the FHIR portal directly).
 *    Choose your app type carefully — single patient vs bulk. For Auralyn's
 *    use case (per-encounter write-back), single patient is correct.
 *
 * 3. Chart note writing uses eCW's proprietary Progress Notes API,
 *    NOT a standard FHIR DocumentReference write (eCW doesn't support that).
 *    ICD-10 and CPT use standard FHIR Condition and Procedure resources.
 *
 * 4. Rate limits in production are stricter than sandbox. Build in
 *    exponential backoff from day one (already implemented below).
 *
 * File: server/ehr/ECWWriter.ts
 */

import { appendAuditEvent } from "../audit/HashChain";
import { db } from "../db";

export interface ECWCredentials {
  clientId: string;        // from ECW_CLIENT_ID env var
  clientSecret: string;    // from ECW_CLIENT_SECRET env var
  fhirBaseUrl: string;     // from ECW_FHIR_BASE_URL env var — practice-specific
  practiceId: string;      // from ECW_PRACTICE_ID env var
}

export interface ECWWriteResult {
  progressNoteId: string | null;
  conditionsWritten: string[];
  proceduresWritten: string[];
  medicationsWritten: string[];
  errors: string[];
  success: boolean;
  partialSuccess: boolean;  // some items written, some failed
}

export class ECWWriter {
  private credentials: ECWCredentials;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.credentials = {
      clientId:     process.env.ECW_CLIENT_ID     || "",
      clientSecret: process.env.ECW_CLIENT_SECRET || "",
      fhirBaseUrl:  process.env.ECW_FHIR_BASE_URL || "",
      practiceId:   process.env.ECW_PRACTICE_ID   || "",
    };
  }

  // ── OAuth2 — eCW uses client_credentials for backend service apps ────────
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // eCW token endpoint is practice-specific
    // Format: https://{practice-subdomain}.eclinicalworks.com/oauth2/default/v1/token
    const tokenUrl = `${this.credentials.fhirBaseUrl}/oauth2/default/v1/token`;

    const response = await this.fetchWithRetry(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Basic auth with client_id:client_secret base64 encoded
        "Authorization": `Basic ${Buffer.from(
          `${this.credentials.clientId}:${this.credentials.clientSecret}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "system/Patient.read system/Encounter.write system/Condition.write system/Procedure.write system/MedicationRequest.write",
      }).toString(),
    });

    const data = await response.json();

    if (!data.access_token) {
      throw new Error(`ECW token error: ${JSON.stringify(data)}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  // ── FHIR fetch with auth + exponential backoff ───────────────────────────
  private async fhirFetch(
    path: string,
    method = "GET",
    body?: any,
    attempt = 1
  ): Promise<any> {
    const token = await this.getToken();
    const url = `${this.credentials.fhirBaseUrl}/fhir/r4${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        "Authorization":  `Bearer ${token}`,
        "Content-Type":   "application/fhir+json",
        "Accept":         "application/fhir+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Rate limit — exponential backoff
    if (response.status === 429 && attempt <= 4) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[ECW] Rate limited — retrying in ${Math.round(delay)}ms (attempt ${attempt})`);
      await new Promise(r => setTimeout(r, delay));
      return this.fhirFetch(path, method, body, attempt + 1);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ECW FHIR ${response.status} on ${method} ${path}: ${errText}`);
    }

    // 204 No Content is success for some writes
    if (response.status === 204) return { success: true };

    return response.json();
  }

  // ── Check what this eCW instance actually supports ───────────────────────
  // Run this first in any new environment to know the actual FHIR surface area
  async getCapabilityStatement(): Promise<any> {
    return this.fhirFetch("/metadata");
  }

  // ── Read patient by MRN ──────────────────────────────────────────────────
  async getPatientByMRN(mrn: string): Promise<any> {
    const result = await this.fhirFetch(
      `/Patient?identifier=${encodeURIComponent(mrn)}`
    );
    return result.entry?.[0]?.resource ?? null;
  }

  // ── Read patient's current medications ──────────────────────────────────
  // Use this BEFORE the encounter to pre-populate the dialogue engine
  async getActiveMedications(ecwPatientId: string): Promise<string[]> {
    try {
      const result = await this.fhirFetch(
        `/MedicationRequest?patient=${ecwPatientId}&status=active`
      );
      return (result.entry || []).map((e: any) =>
        e.resource?.medicationCodeableConcept?.text ||
        e.resource?.medicationCodeableConcept?.coding?.[0]?.display ||
        "Unknown medication"
      );
    } catch {
      return []; // Non-blocking — return empty if not available
    }
  }

  // ── Read patient's allergies ─────────────────────────────────────────────
  async getAllergies(ecwPatientId: string): Promise<string[]> {
    try {
      const result = await this.fhirFetch(
        `/AllergyIntolerance?patient=${ecwPatientId}&clinical-status=active`
      );
      return (result.entry || []).map((e: any) =>
        e.resource?.code?.text ||
        e.resource?.code?.coding?.[0]?.display ||
        "Unknown allergy"
      );
    } catch {
      return [];
    }
  }

  // ── Read active conditions ───────────────────────────────────────────────
  async getActiveConditions(ecwPatientId: string): Promise<string[]> {
    try {
      const result = await this.fhirFetch(
        `/Condition?patient=${ecwPatientId}&clinical-status=active`
      );
      return (result.entry || []).map((e: any) =>
        e.resource?.code?.text ||
        e.resource?.code?.coding?.[0]?.display ||
        "Unknown condition"
      );
    } catch {
      return [];
    }
  }

  // ── Write ICD-10 diagnosis as FHIR Condition ─────────────────────────────
  async writeCondition(params: {
    ecwPatientId: string;
    encounterId: string;
    icd10Code: string;
    diagnosisName: string;
    clinicalStatus?: "active" | "resolved";
  }): Promise<string | null> {
    const condition = {
      resourceType: "Condition",
      clinicalStatus: {
        coding: [{
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: params.clinicalStatus || "active",
        }],
      },
      code: {
        coding: [{
          system: "http://hl7.org/fhir/sid/icd-10-cm",
          code: params.icd10Code,
          display: params.diagnosisName,
        }],
        text: params.diagnosisName,
      },
      subject: { reference: `Patient/${params.ecwPatientId}` },
      encounter: { reference: `Encounter/${params.encounterId}` },
      recordedDate: new Date().toISOString(),
    };

    const result = await this.fhirFetch("/Condition", "POST", condition);
    return result.id || null;
  }

  // ── Write CPT procedure code ─────────────────────────────────────────────
  async writeProcedure(params: {
    ecwPatientId: string;
    encounterId: string;
    cptCode: string;
    description: string;
  }): Promise<string | null> {
    const procedure = {
      resourceType: "Procedure",
      status: "completed",
      code: {
        coding: [{
          system: "http://www.ama-assn.org/go/cpt",
          code: params.cptCode,
          display: params.description,
        }],
        text: params.description,
      },
      subject: { reference: `Patient/${params.ecwPatientId}` },
      encounter: { reference: `Encounter/${params.encounterId}` },
      performedDateTime: new Date().toISOString(),
    };

    const result = await this.fhirFetch("/Procedure", "POST", procedure);
    return result.id || null;
  }

  // ── Write chart note via eCW proprietary Progress Notes API ─────────────
  // NOTE: eCW does NOT support FHIR DocumentReference writes.
  // Progress notes must use eCW's proprietary REST API endpoint.
  async writeProgressNote(params: {
    ecwPatientId: string;
    ecwEncounterId: string;
    chartNote: string;
    noteType?: string;
  }): Promise<string | null> {
    const token = await this.getToken();

    // eCW proprietary endpoint — not part of FHIR path
    const url = `${this.credentials.fhirBaseUrl}/api/v1/patients/${params.ecwPatientId}/encounters/${params.ecwEncounterId}/progressnotes`;

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        noteType: params.noteType || "PROGRESS_NOTE",
        noteText: params.chartNote,
        signedBy: this.credentials.practiceId,
        signedDate: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`ECW progress note write failed: ${err}`);
    }

    const data = await response.json();
    return data.noteId || data.id || null;
  }

  // ── Write prescription via eCW proprietary API ───────────────────────────
  async writePrescription(params: {
    ecwPatientId: string;
    ecwEncounterId: string;
    medicationName: string;
    sig: string;
    quantity: string;
    refills: number;
    daysSupply: number;
    rxcui?: string;       // RxNorm code if available
  }): Promise<void> {
    const token = await this.getToken();

    const url = `${this.credentials.fhirBaseUrl}/api/v1/patients/${params.ecwPatientId}/prescriptions`;

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        encounterId:   params.ecwEncounterId,
        medicationName: params.medicationName,
        sig:           params.sig,
        quantity:      params.quantity,
        refills:       params.refills,
        daysSupply:    params.daysSupply,
        rxcui:         params.rxcui,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`ECW prescription write failed: ${err}`);
    }
  }

  // ── Full encounter write ─────────────────────────────────────────────────
  async writeFullEncounter(auralyn: {
    ecwPatientId: string;
    ecwEncounterId: string;
    chartNote: string;
    primaryDiagnosis: string;
    primaryIcd10: string;
    secondaryDiagnoses: Array<{ name: string; icd10: string }>;
    cptCodes: Array<{ code: string; description: string }>;
    prescriptions: Array<{
      medicationName: string; sig: string;
      quantity: string; refills: number; daysSupply: number; rxcui?: string;
    }>;
  }): Promise<ECWWriteResult> {

    const result: ECWWriteResult = {
      progressNoteId: null,
      conditionsWritten: [],
      proceduresWritten: [],
      medicationsWritten: [],
      errors: [],
      success: false,
      partialSuccess: false,
    };

    // 1. Write progress note (chart note)
    try {
      result.progressNoteId = await this.writeProgressNote({
        ecwPatientId:  auralyn.ecwPatientId,
        ecwEncounterId: auralyn.ecwEncounterId,
        chartNote:     auralyn.chartNote,
      });
    } catch (err: any) {
      result.errors.push(`Progress note: ${err.message}`);
    }

    // 2. Primary diagnosis
    try {
      await this.writeCondition({
        ecwPatientId:  auralyn.ecwPatientId,
        encounterId:   auralyn.ecwEncounterId,
        icd10Code:     auralyn.primaryIcd10,
        diagnosisName: auralyn.primaryDiagnosis,
      });
      result.conditionsWritten.push(auralyn.primaryDiagnosis);
    } catch (err: any) {
      result.errors.push(`Primary dx: ${err.message}`);
    }

    // 3. Secondary diagnoses — non-blocking per item
    for (const dx of auralyn.secondaryDiagnoses) {
      try {
        await this.writeCondition({
          ecwPatientId:  auralyn.ecwPatientId,
          encounterId:   auralyn.ecwEncounterId,
          icd10Code:     dx.icd10,
          diagnosisName: dx.name,
        });
        result.conditionsWritten.push(dx.name);
      } catch (err: any) {
        result.errors.push(`Secondary dx ${dx.name}: ${err.message}`);
      }
    }

    // 4. CPT codes
    for (const cpt of auralyn.cptCodes) {
      try {
        await this.writeProcedure({
          ecwPatientId: auralyn.ecwPatientId,
          encounterId:  auralyn.ecwEncounterId,
          cptCode:      cpt.code,
          description:  cpt.description,
        });
        result.proceduresWritten.push(cpt.code);
      } catch (err: any) {
        result.errors.push(`CPT ${cpt.code}: ${err.message}`);
      }
    }

    // 5. Prescriptions
    for (const rx of auralyn.prescriptions) {
      try {
        await this.writePrescription({
          ecwPatientId:   auralyn.ecwPatientId,
          ecwEncounterId: auralyn.ecwEncounterId,
          ...rx,
        });
        result.medicationsWritten.push(rx.medicationName);
      } catch (err: any) {
        result.errors.push(`Rx ${rx.medicationName}: ${err.message}`);
      }
    }

    result.success = result.errors.length === 0;
    result.partialSuccess = !result.success &&
      (result.conditionsWritten.length > 0 || result.progressNoteId !== null);

    // Audit log
    await appendAuditEvent({
      eventType: "ECW_WRITE_ATTEMPT",
      metadata: {
        ecwPatientId:    auralyn.ecwPatientId,
        ecwEncounterId:  auralyn.ecwEncounterId,
        success:         result.success,
        partialSuccess:  result.partialSuccess,
        errorCount:      result.errors.length,
      },
    });

    // Dead letter queue on failure (uses your existing ehr-outbound queue)
    if (!result.success && !result.partialSuccess) {
      await db.execute(
        `INSERT INTO ehr_dead_letter (encounter_id, payload, error, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [auralyn.ecwEncounterId, JSON.stringify(auralyn), result.errors.join("; ")]
      );
    }

    return result;
  }

  // ── Pre-populate dialogue from existing chart ────────────────────────────
  // Call this when a returning patient starts intake — fills clinical state
  // from their eCW chart before the first question is asked
  async prefillFromChart(ecwPatientId: string): Promise<{
    medications: string[];
    allergies: string[];
    conditions: string[];
  }> {
    const [medications, allergies, conditions] = await Promise.allSettled([
      this.getActiveMedications(ecwPatientId),
      this.getAllergies(ecwPatientId),
      this.getActiveConditions(ecwPatientId),
    ]);

    return {
      medications: medications.status === "fulfilled" ? medications.value : [],
      allergies:   allergies.status === "fulfilled"   ? allergies.value   : [],
      conditions:  conditions.status === "fulfilled"  ? conditions.value  : [],
    };
  }

  // Exponential backoff wrapper
  private async fetchWithRetry(url: string, init: RequestInit, attempt = 1): Promise<Response> {
    const response = await fetch(url, init);
    if (response.status === 429 && attempt <= 4) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
      return this.fetchWithRetry(url, init, attempt + 1);
    }
    return response;
  }
}
