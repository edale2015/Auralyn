/**
 * AURALYN — Athena EHR Write-back (FHIR R4 compatible)
 *
 * Writes chart notes, diagnoses (ICD-10), procedures (CPT),
 * and prescriptions back to Athena Health via their proprietary REST API.
 *
 * Prerequisites:
 *   - Registered Marketplace application (free for clinical use)
 *   - ATHENA_CLIENT_ID, ATHENA_CLIENT_SECRET in environment
 *   - ATHENA_PRACTICE_ID in environment
 *   - BAA with Athena Health covering API usage
 *
 * File: server/ehr/AthenaEHRWriter.ts
 */

import { logger } from "../utils/logger";

export interface EHRWriteResult {
  noteId:               string | null;
  diagnosesWritten:     string[];
  proceduresWritten:    string[];
  prescriptionsWritten: string[];
  errors:               string[];
  success:              boolean;
}

export class AthenaEHRWriter {
  private readonly baseUrl:    string;
  private readonly practiceId: string;
  private accessToken:  string | null = null;
  private tokenExpiry:  number = 0;

  constructor() {
    this.baseUrl    = "https://api.platform.athenahealth.com/v1";
    this.practiceId = process.env.ATHENA_PRACTICE_ID ?? "";
  }

  // ── OAuth2 token (client_credentials) ──────────────────────────────────────

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(
      "https://api.platform.athenahealth.com/oauth2/v1/token",
      {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({
          grant_type:    "client_credentials",
          client_id:     process.env.ATHENA_CLIENT_ID ?? "",
          client_secret: process.env.ATHENA_CLIENT_SECRET ?? "",
          scope:         "athena/service/Athena.Charts.Encounter:write",
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Athena OAuth failed (${response.status}): ${body}`);
    }

    const data          = await response.json() as { access_token: string; expires_in: number };
    this.accessToken    = data.access_token;
    this.tokenExpiry    = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  private async athenaFetch(path: string, method = "GET", body?: Record<string, unknown>): Promise<any> {
    const token    = await this.getToken();
    const response = await fetch(
      `${this.baseUrl}/${this.practiceId}${path}`,
      {
        method,
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Athena API error ${response.status}: ${err}`);
    }

    return response.json();
  }

  // ── Write chart note ────────────────────────────────────────────────────────

  async writeChartNote(params: {
    patientId:      string;
    departmentId:   string;
    appointmentId:  string;
    chartNote:      string;
  }): Promise<string> {
    const result = await this.athenaFetch(
      `/patients/${params.patientId}/encounters/${params.appointmentId}/notes`,
      "POST",
      {
        notetype:     "CLINICALDOCUMENTATION",
        notetext:     params.chartNote,
        departmentid: params.departmentId,
      }
    );
    return result.encounternoteid ?? result.id ?? "";
  }

  // ── Write ICD-10 diagnosis ──────────────────────────────────────────────────

  async writeDiagnosis(params: {
    patientId:      string;
    appointmentId:  string;
    icd10Code:      string;
    diagnosisName:  string;
  }): Promise<void> {
    await this.athenaFetch(
      `/patients/${params.patientId}/encounters/${params.appointmentId}/diagnoses`,
      "POST",
      {
        diagnosiscode:        params.icd10Code,
        diagnosisdescription: params.diagnosisName,
        diagnosistype:        "MEDICAL",
      }
    );
  }

  // ── Write CPT procedure codes ───────────────────────────────────────────────

  async writeProcedures(params: {
    patientId:     string;
    appointmentId: string;
    cptCodes:      Array<{ code: string; description: string; units?: number }>;
  }): Promise<void> {
    for (const cpt of params.cptCodes) {
      await this.athenaFetch(
        `/patients/${params.patientId}/encounters/${params.appointmentId}/procedures`,
        "POST",
        {
          procedurecode:        cpt.code,
          proceduredescription: cpt.description,
          unitcount:            cpt.units ?? 1,
        }
      );
    }
  }

  // ── Write prescription ──────────────────────────────────────────────────────

  async writePrescription(params: {
    patientId:      string;
    departmentId:   string;
    medicationName: string;
    sig:            string;
    quantity:       string;
    refills:        number;
    daysSupply:     number;
    pharmacyId?:    string;
  }): Promise<void> {
    await this.athenaFetch(
      `/patients/${params.patientId}/prescriptions`,
      "POST",
      {
        departmentid:   params.departmentId,
        medicationname: params.medicationName,
        sig:            params.sig,
        quantity:       params.quantity,
        refills:        params.refills,
        dayssupply:     params.daysSupply,
        ...(params.pharmacyId ? { pharmacyid: params.pharmacyId } : {}),
        prescriptiontype: "ORDER",
      }
    );
  }

  // ── Full encounter write (orchestrates all steps) ───────────────────────────

  async writeFullEncounter(params: {
    patientId:           string;
    departmentId:        string;
    appointmentId:       string;
    chartNote:           string;
    primaryDiagnosis:    string;
    icd10:               string;
    secondaryDiagnoses:  Array<{ name: string; icd10: string }>;
    cptCodes:            Array<{ code: string; description: string }>;
    prescriptions:       Array<{
      medicationName: string; sig: string;
      quantity: string; refills: number; daysSupply: number;
    }>;
  }): Promise<EHRWriteResult> {
    const result: EHRWriteResult = {
      noteId: null, diagnosesWritten: [], proceduresWritten: [],
      prescriptionsWritten: [], errors: [], success: false,
    };

    if (!this.practiceId) {
      result.errors.push("ATHENA_PRACTICE_ID not configured");
      return result;
    }

    try {
      // 1. Chart note
      result.noteId = await this.writeChartNote({
        patientId:     params.patientId,
        departmentId:  params.departmentId,
        appointmentId: params.appointmentId,
        chartNote:     params.chartNote,
      });
      logger.info("[AthenaEHR] Chart note written", { noteId: result.noteId });

      // 2. Primary diagnosis
      await this.writeDiagnosis({
        patientId:     params.patientId,
        appointmentId: params.appointmentId,
        icd10Code:     params.icd10,
        diagnosisName: params.primaryDiagnosis,
      });
      result.diagnosesWritten.push(params.primaryDiagnosis);

      // 3. Secondary diagnoses (non-blocking individual failures)
      for (const dx of params.secondaryDiagnoses) {
        try {
          await this.writeDiagnosis({
            patientId: params.patientId, appointmentId: params.appointmentId,
            icd10Code: dx.icd10, diagnosisName: dx.name,
          });
          result.diagnosesWritten.push(dx.name);
        } catch (err: any) {
          result.errors.push(`Secondary dx ${dx.name}: ${err.message}`);
        }
      }

      // 4. Procedure codes
      await this.writeProcedures({ patientId: params.patientId, appointmentId: params.appointmentId, cptCodes: params.cptCodes });
      result.proceduresWritten = params.cptCodes.map(c => c.code);

      // 5. Prescriptions (non-blocking individual failures)
      for (const rx of params.prescriptions) {
        try {
          await this.writePrescription({
            patientId: params.patientId, departmentId: params.departmentId,
            ...rx,
          });
          result.prescriptionsWritten.push(rx.medicationName);
        } catch (err: any) {
          result.errors.push(`Rx ${rx.medicationName}: ${err.message}`);
        }
      }

      result.success = true;
      logger.info("[AthenaEHR] Full encounter written successfully", {
        patientId: params.patientId, appointmentId: params.appointmentId,
        diagnosesWritten: result.diagnosesWritten.length,
        proceduresWritten: result.proceduresWritten.length,
        prescriptionsWritten: result.prescriptionsWritten.length,
      });
    } catch (err: any) {
      result.errors.push(`Fatal: ${err.message}`);
      logger.error("[AthenaEHR] Full encounter write failed", { error: err?.message, patientId: params.patientId });
    }

    return result;
  }
}

export const athenaEHRWriter = new AthenaEHRWriter();
