import { runFinalPipeline } from "../clinical/finalPipeline";
import { sendPilotCase } from "../integrations/hospitalPilot";
import { updateStats } from "../simulation/pilotStats";
import { broadcast } from "../control/controlBus";

export interface EMSDispatch {
  location: string;
  patientId: string;
  priority: "CODE_RED" | "CODE_YELLOW";
  dispatchedAt: string;
}

export interface PilotWorkflowResult {
  patientId: string;
  disposition: string;
  emsDispatched: boolean;
  pilotCaseSent: boolean;
  durationMs: number;
}

export interface PhysicianOverride {
  patientId: string;
  previousDisposition: string;
  newDisposition: string;
  physicianId?: string;
  reason?: string;
  overriddenAt: string;
}

const emsLog: EMSDispatch[] = [];
const overrideLog: PhysicianOverride[] = [];

export async function dispatchEMS(location: string, patientId = "unknown"): Promise<EMSDispatch> {
  const dispatch: EMSDispatch = {
    location,
    patientId,
    priority: "CODE_RED",
    dispatchedAt: new Date().toISOString(),
  };
  emsLog.push(dispatch);
  if (emsLog.length > 200) emsLog.shift();
  broadcast("ems_dispatch", dispatch);
  console.log(`[EMS] 🚨 Dispatched to ${location} — patient ${patientId}`);
  return dispatch;
}

export async function pilotWorkflow(
  patient: {
    patientId: string;
    complaint?: string;
    freeText?: string;
    ageYears?: number;
    location?: string;
  },
  _token = ""
): Promise<PilotWorkflowResult> {
  const t0 = Date.now();

  const triage = runFinalPipeline({
    patientId: patient.patientId,
    freeText: patient.freeText ?? patient.complaint ?? "unknown",
    ageYears: patient.ageYears,
  });

  const disposition = triage.safetyDisposition;
  let emsDispatched = false;
  let pilotCaseSent = false;

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
    pilotCaseSent = true;
  } catch {
    pilotCaseSent = false;
  }

  const durationMs = Date.now() - t0;
  updateStats({ patientId: patient.patientId, disposition, latencyMs: durationMs });
  broadcast("pilot_case", { patientId: patient.patientId, disposition, durationMs });

  return { patientId: patient.patientId, disposition, emsDispatched, pilotCaseSent, durationMs };
}

export function recordPhysicianOverride(override: Omit<PhysicianOverride, "overriddenAt">): PhysicianOverride {
  const record: PhysicianOverride = { ...override, overriddenAt: new Date().toISOString() };
  overrideLog.push(record);
  if (overrideLog.length > 500) overrideLog.shift();
  broadcast("physician_override", record);
  console.log(`[Override] Patient ${override.patientId}: ${override.previousDisposition} → ${override.newDisposition}`);
  return record;
}

export function getEMSLog(): EMSDispatch[] { return [...emsLog]; }
export function getOverrideLog(): PhysicianOverride[] { return [...overrideLog]; }
