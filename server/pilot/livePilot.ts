import { runFinalPipeline } from "../clinical/finalPipeline";
import { sendPilotCase, receiveOutcome } from "../integrations/hospitalPilot";
import { broadcast } from "../control/controlBus";
import { dispatchEMS } from "../autopilot/pilotWorkflow";

export interface LivePilotResult {
  patientId: string;
  disposition: string;
  emsDispatched: boolean;
  sentToHospital: boolean;
  ts: string;
}

export interface HospitalOutcome {
  patientId: string;
  actualDisposition?: string;
  outcome?: string;
  feedback?: string;
  [key: string]: unknown;
}

export async function runLivePilot(patient: {
  patientId: string;
  freeText?: string;
  complaint?: string;
  ageYears?: number;
  location?: string;
}): Promise<LivePilotResult> {
  const result = runFinalPipeline({
    patientId: patient.patientId,
    freeText: patient.freeText ?? patient.complaint ?? "unknown",
    ageYears: patient.ageYears,
  });

  const disposition = result.safetyDisposition;
  let emsDispatched = false;
  let sentToHospital = false;

  if (disposition === "ER_NOW" && patient.location) {
    await dispatchEMS(patient.location, patient.patientId);
    emsDispatched = true;
  }

  try {
    await sendPilotCase({
      patientId: patient.patientId,
      complaint: patient.complaint ?? patient.freeText ?? "unknown",
      disposition,
    });
    sentToHospital = true;
  } catch {
    sentToHospital = false;
  }

  const r: LivePilotResult = {
    patientId: patient.patientId,
    disposition,
    emsDispatched,
    sentToHospital,
    ts: new Date().toISOString(),
  };

  broadcast("live_pilot_case", r);
  return r;
}

export async function ingestHospitalOutcome(outcome: HospitalOutcome): Promise<boolean> {
  console.log("[LivePilot] Outcome received:", outcome);
  try {
    await receiveOutcome({
      patientId: outcome.patientId,
      disposition: outcome.actualDisposition ?? outcome.outcome ?? "unknown",
      match: true,
    });
  } catch {
    /* degrade gracefully */
  }
  broadcast("hospital_outcome", { ...outcome, ts: Date.now() });
  return true;
}
