/**
 * Surescripts eRx Adapter — electronic prescription transmission.
 *
 * In production: replace the stub body with the real Surescripts SOAP/REST call.
 * The interface is intentionally kept thin so callers are decoupled from the
 * Surescripts API contract.
 */

const SURESCRIPTS_ENABLED = process.env.SURESCRIPTS_ENABLED === "true";

export interface EPrescriptionPayload {
  patientId:   string;
  drug:        string;
  dose:        string;
  quantity:    number;
  refills:     number;
  pharmacyId:  string;
  prescriberId: string;
  npi?:        string;
  deaNumber?:  string;
  sig?:        string;
  notes?:      string;
}

export interface EPrescriptionResult {
  status:     "SENT" | "QUEUED" | "REJECTED" | "STUB";
  messageId?: string;
  pharmacyId: string;
  drug:       string;
  timestamp:  string;
  error?:     string;
}

/**
 * Transmit an electronic prescription via Surescripts.
 * When SURESCRIPTS_ENABLED=false (default) the call is stubbed with a
 * STUB status so the rest of the pipeline can still exercise the flow.
 */
export async function sendEPrescription(
  payload: EPrescriptionPayload
): Promise<EPrescriptionResult> {
  const timestamp = new Date().toISOString();

  if (!SURESCRIPTS_ENABLED) {
    console.log(`[Surescripts] STUB — would send ${payload.drug} to pharmacy ${payload.pharmacyId}`);
    return {
      status:     "STUB",
      messageId:  `STUB-${Date.now()}`,
      pharmacyId: payload.pharmacyId,
      drug:       payload.drug,
      timestamp,
    };
  }

  // ── Production Surescripts integration goes here ─────────────────────────
  // const client = new SurescriptsClient({ ... });
  // const response = await client.sendNewRx({ ... });
  // return { status: "SENT", messageId: response.messageId, ... };

  throw new Error("Surescripts live integration not yet implemented — set SURESCRIPTS_ENABLED=false for stub mode");
}

/**
 * Verify a pharmacy NCPDP ID is active in the Surescripts directory.
 * Returns true when disabled (no false positives in stub mode).
 */
export async function verifyPharmacy(ncpdpId: string): Promise<boolean> {
  if (!SURESCRIPTS_ENABLED) {
    console.log(`[Surescripts] STUB — pharmacy verify: ${ncpdpId}`);
    return true;
  }
  throw new Error("Surescripts live pharmacy verify not yet implemented");
}
