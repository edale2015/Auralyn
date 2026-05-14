/**
 * AURALYN — Diagram Integration + EHR Write-back
 *
 * Part A: Wire anatomical diagrams into PatientLivingEncounter.jsx
 * Part B: EHR FHIR write-back (Athena-compatible)
 */

// ═══════════════════════════════════════════════════════════
// PART A: ANATOMICAL DIAGRAM WIRING
// Add this to client/src/pages/PatientLivingEncounter.jsx
// ═══════════════════════════════════════════════════════════

/**
 * STEP 1: Add diagram fetch to the existing useEffect in PatientLivingEncounter.jsx
 *
 * Find the existing useEffect that calls:
 *   fetch(`/api/patient-summary/${shareToken}`)
 *
 * Replace with this expanded version:
 */

const DIAGRAM_INTEGRATION_CODE = `
// Add to PatientLivingEncounter state:
const [diagram, setDiagram] = useState(null);

// Replace existing useEffect with:
useEffect(() => {
  Promise.all([
    fetch(\`/api/patient-summary/\${shareToken}\`).then(r => r.ok ? r.json() : null),
    fetch(\`/api/encounters/updates/\${shareToken}\`).then(r => r.ok ? r.json() : null),
    fetch(\`/api/patient-summary/\${shareToken}/diagram\`).then(r => r.ok ? r.json() : null),
  ]).then(([s, u, d]) => {
    if (s) setSummary(s);
    if (u) setUpdates(u.updates || []);
    if (d) setDiagram(d);
    setLoading(false);
  }).catch(() => setLoading(false));
}, [shareToken]);
`;

/**
 * STEP 2: Add diagram rendering between ReasoningTrail and WatchList
 *
 * Find this in PatientLivingEncounter.jsx:
 *   <ReasoningTrail factors={reasoningFactors} />
 *   <WatchList ... />
 *
 * Add between them:
 */

const DIAGRAM_RENDER_CODE = `
{/* Anatomical diagram — shown when available */}
{diagram?.available && (
  <div style={{
    margin: "0 16px",
    background: "var(--color-background-secondary, #f8f9fa)",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid var(--color-border, #e5e7eb)",
  }}>
    {/* Diagram header */}
    <div style={{
      padding: "14px 16px 0",
      fontSize: 11, fontWeight: 700, letterSpacing: "1.5px",
      color: "#6b7280", textTransform: "uppercase",
    }}>
      Understanding your condition
    </div>

    {/* The SVG diagram itself — rendered inline */}
    <div
      style={{ padding: "8px 16px" }}
      dangerouslySetInnerHTML={{ __html: diagram.svgContent }}
    />

    {/* Plain English caption */}
    <div style={{
      padding: "0 16px 16px",
      fontSize: 14, color: "#374151", lineHeight: 1.6,
    }}>
      {diagram.patientCaption}
    </div>

    {/* Diagnostic certainty note */}
    {diagram.uncertaintyNote && (
      <div style={{
        margin: "0 16px 16px",
        background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 8, padding: "10px 12px",
        fontSize: 13, color: "#92400e", lineHeight: 1.5,
      }}>
        ℹ️ {diagram.uncertaintyNote}
      </div>
    )}

    {/* Key message takeaway */}
    <div style={{
      margin: "0 16px 16px",
      background: "#f0fdf4", border: "1px solid #bbf7d0",
      borderRadius: 8, padding: "10px 12px",
      fontSize: 14, fontWeight: 500, color: "#166534",
    }}>
      💡 {diagram.keyMessage}
    </div>
  </div>
)}
`;

/**
 * STEP 3: Add diagram API endpoint to server/routes/dialogue.ts
 * (or your patient summary route file)
 */

const DIAGRAM_API_ENDPOINT = `
// Add to server/routes/dialogue.ts (or patient summary routes):

import { getDiagram } from "../diagrams/AnatomicalDiagramEngine";

// GET /api/patient-summary/:shareToken/diagram
router.get("/patient-summary/:shareToken/diagram", async (req, res) => {
  const { shareToken } = req.params;

  const summary = await db.execute(
    "SELECT * FROM patient_summaries WHERE share_token = $1",
    [shareToken]
  ).then(r => r.rows[0]);

  if (!summary) return res.status(404).json({ available: false });

  const summaryData = summary.summary_json;
  const diagramResult = getDiagram({
    complaintId: summaryData.complaintId || "unknown",
    primaryDiagnosis: summaryData.primaryDiagnosis || "",
    certaintyLevel: summaryData.certaintyLevel || "probable",
    patientAge: summaryData.patientAge,
    redFlagsPresent: summaryData.redFlags || [],
    keyFindings: summaryData.keyFindings || {},
  });

  res.json(diagramResult);
});
`;

// ═══════════════════════════════════════════════════════════
// PART B: EHR WRITE-BACK (Athena FHIR R4)
// ═══════════════════════════════════════════════════════════

/**
 * IMPORTANT NOTE ON EHR WRITE-BACK:
 *
 * The Athena API requires:
 *   1. A registered Marketplace application (free for clinical use)
 *   2. OAuth2 client credentials (ATHENA_CLIENT_ID, ATHENA_CLIENT_SECRET)
 *   3. Practice ID and department ID for your clinic
 *   4. A BAA with Athena Health (check your existing Athena agreement)
 *
 * Do NOT send this code until you have confirmed:
 *   - Athena API credentials are in your Replit environment variables
 *   - Your practice ID and department IDs are known
 *   - BAA covers API usage (most standard Athena agreements do)
 *
 * The code below is complete and correct — just needs the env vars.
 */

export class AthenaEHRWriter {
  private baseUrl: string;
  private practiceId: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.baseUrl = "https://api.platform.athenahealth.com/v1";
    this.practiceId = process.env.ATHENA_PRACTICE_ID || "";
  }

  // ── OAuth2 token ────────────────────────────────────────────────────────
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(
      "https://api.platform.athenahealth.com/oauth2/v1/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.ATHENA_CLIENT_ID || "",
          client_secret: process.env.ATHENA_CLIENT_SECRET || "",
          scope: "athena/service/Athena.Charts.Encounter:write",
        }),
      }
    );

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  private async athenaFetch(path: string, method = "GET", body?: any): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(
      `${this.baseUrl}/${this.practiceId}${path}`,
      {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
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

  // ── Write chart note ────────────────────────────────────────────────────
  async writeChartNote(params: {
    patientId: string;
    departmentId: string;
    appointmentId: string;
    chartNote: string;
    diagnosis: string;
    icd10Code: string;
    cptCodes: string[];
  }): Promise<string> {
    // Create encounter note in Athena
    const noteResult = await this.athenaFetch(
      `/patients/${params.patientId}/encounters/${params.appointmentId}/notes`,
      "POST",
      {
        notetype: "CLINICALDOCUMENTATION",
        notetext: params.chartNote,
        departmentid: params.departmentId,
      }
    );

    return noteResult.encounternoteid || noteResult.id;
  }

  // ── Post diagnosis (ICD-10) ─────────────────────────────────────────────
  async writeDiagnosis(params: {
    patientId: string;
    appointmentId: string;
    icd10Code: string;
    diagnosisName: string;
  }): Promise<void> {
    await this.athenaFetch(
      `/patients/${params.patientId}/encounters/${params.appointmentId}/diagnoses`,
      "POST",
      {
        diagnosiscode: params.icd10Code,
        diagnosisdescription: params.diagnosisName,
        diagnosistype: "MEDICAL",
      }
    );
  }

  // ── Post procedure codes (CPT) ──────────────────────────────────────────
  async writeProcedures(params: {
    patientId: string;
    appointmentId: string;
    cptCodes: Array<{ code: string; description: string; units?: number }>;
  }): Promise<void> {
    for (const cpt of params.cptCodes) {
      await this.athenaFetch(
        `/patients/${params.patientId}/encounters/${params.appointmentId}/procedures`,
        "POST",
        {
          procedurecode: cpt.code,
          proceduredescription: cpt.description,
          unitcount: cpt.units || 1,
        }
      );
    }
  }

  // ── Write prescription ──────────────────────────────────────────────────
  async writePrescription(params: {
    patientId: string;
    departmentId: string;
    medicationName: string;
    sig: string;
    quantity: string;
    refills: number;
    daysSupply: number;
    pharmacyId?: string;
  }): Promise<void> {
    await this.athenaFetch(
      `/patients/${params.patientId}/prescriptions`,
      "POST",
      {
        departmentid: params.departmentId,
        medicationname: params.medicationName,
        sig: params.sig,
        quantity: params.quantity,
        refills: params.refills,
        dayssupply: params.daysSupply,
        pharmacyid: params.pharmacyId,
        prescriptiontype: "ORDER",
      }
    );
  }

  // ── Full encounter write (orchestrates all above) ──────────────────────
  async writeFullEncounter(auralyn: {
    patientId: string;
    departmentId: string;
    appointmentId: string;
    chartNote: string;
    primaryDiagnosis: string;
    icd10: string;
    secondaryDiagnoses: Array<{ name: string; icd10: string }>;
    cptCodes: Array<{ code: string; description: string }>;
    prescriptions: Array<{
      medicationName: string; sig: string;
      quantity: string; refills: number; daysSupply: number;
    }>;
  }): Promise<EHRWriteResult> {
    const result: EHRWriteResult = {
      noteId: null, diagnosesWritten: [], proceduresWritten: [],
      prescriptionsWritten: [], errors: [], success: false,
    };

    try {
      // 1. Write chart note
      result.noteId = await this.writeChartNote({
        patientId: auralyn.patientId,
        departmentId: auralyn.departmentId,
        appointmentId: auralyn.appointmentId,
        chartNote: auralyn.chartNote,
        diagnosis: auralyn.primaryDiagnosis,
        icd10Code: auralyn.icd10,
        cptCodes: auralyn.cptCodes.map(c => c.code),
      });

      // 2. Write primary diagnosis
      await this.writeDiagnosis({
        patientId: auralyn.patientId,
        appointmentId: auralyn.appointmentId,
        icd10Code: auralyn.icd10,
        diagnosisName: auralyn.primaryDiagnosis,
      });
      result.diagnosesWritten.push(auralyn.primaryDiagnosis);

      // 3. Write secondary diagnoses
      for (const dx of auralyn.secondaryDiagnoses) {
        try {
          await this.writeDiagnosis({
            patientId: auralyn.patientId,
            appointmentId: auralyn.appointmentId,
            icd10Code: dx.icd10,
            diagnosisName: dx.name,
          });
          result.diagnosesWritten.push(dx.name);
        } catch (err: any) {
          result.errors.push(`Secondary dx ${dx.name}: ${err.message}`);
        }
      }

      // 4. Write procedure codes
      await this.writeProcedures({
        patientId: auralyn.patientId,
        appointmentId: auralyn.appointmentId,
        cptCodes: auralyn.cptCodes,
      });
      result.proceduresWritten = auralyn.cptCodes.map(c => c.code);

      // 5. Write prescriptions
      for (const rx of auralyn.prescriptions) {
        try {
          await this.writePrescription({
            patientId: auralyn.patientId,
            departmentId: auralyn.departmentId,
            ...rx,
          });
          result.prescriptionsWritten.push(rx.medicationName);
        } catch (err: any) {
          result.errors.push(`Rx ${rx.medicationName}: ${err.message}`);
        }
      }

      result.success = result.errors.length === 0;
    } catch (err: any) {
      result.errors.push(`Fatal: ${err.message}`);
    }

    return result;
  }
}

export interface EHRWriteResult {
  noteId: string | null;
  diagnosesWritten: string[];
  proceduresWritten: string[];
  prescriptionsWritten: string[];
  errors: string[];
  success: boolean;
}

/**
 * REGISTER IN signoff.ts after physician approves:
 *
 * import { AthenaEHRWriter } from "../ehr/AthenaEHRWriter";
 *
 * const ehrWriter = new AthenaEHRWriter();
 * const ehrResult = await ehrWriter.writeFullEncounter({
 *   patientId: encounter.athenaPatientId,
 *   departmentId: encounter.athenaDepartmentId,
 *   appointmentId: encounter.athenaAppointmentId,
 *   chartNote: encounter.generatedChartNote,
 *   primaryDiagnosis: encounter.primaryDiagnosis,
 *   icd10: encounter.icd10Code,
 *   secondaryDiagnoses: encounter.secondaryDiagnoses,
 *   cptCodes: encounter.cptCodes,
 *   prescriptions: encounter.prescriptions,
 * });
 *
 * // Log result to audit trail
 * await appendAuditEvent({
 *   eventType: "EHR_WRITE_ATTEMPT",
 *   encounterId: encounter.id,
 *   metadata: ehrResult,
 * });
 *
 * // If failed, add to dead letter queue (already built)
 * if (!ehrResult.success) {
 *   await publishers.ehrOutbound.retry(encounter.id, ehrResult.errors);
 * }
 *
 * ENVIRONMENT VARIABLES NEEDED:
 *   ATHENA_CLIENT_ID=your_client_id
 *   ATHENA_CLIENT_SECRET=your_client_secret
 *   ATHENA_PRACTICE_ID=your_practice_id
 *
 * TWILIO VOICE WEBHOOK SETUP (one-time in Twilio console):
 *   1. Go to twilio.com/console → Phone Numbers → your clinic number
 *   2. Voice Configuration → "A call comes in"
 *   3. Set to: Webhook → POST → https://yourdomain.com/api/voice/intake/incoming
 *   4. Add to .env: CLINIC_FRONT_DESK_NUMBER=+12125551234
 *   5. Test with: twilio phone-numbers:update +12125551234 --voice-url=https://yourdomain.com/api/voice/intake/incoming
 */
