export interface ConsentCheck {
  allowed: boolean;
  message: string;
}

export function requireConsent(patient: { consent?: boolean; consentTimestamp?: string }): ConsentCheck {
  if (!patient.consent) {
    return { allowed: false, message: "Telehealth consent is required before proceeding. Please acknowledge consent to continue." };
  }
  return { allowed: true, message: "Consent verified" };
}

const LICENSED_STATES = ["NY"];

export function validateLocation(state: string): ConsentCheck {
  if (!LICENSED_STATES.includes(state.toUpperCase())) {
    return { allowed: false, message: `Service currently available in ${LICENSED_STATES.join(", ")} only. Your state (${state}) is not yet supported.` };
  }
  return { allowed: true, message: `Licensed in ${state}` };
}

export interface PhysicianSignoff {
  caseId: string;
  physicianId: string;
  timestamp: string;
  action: "approved" | "modified" | "rejected";
}

const signoffLog: PhysicianSignoff[] = [];

export function logPhysicianSignoff(caseId: string, physicianId: string, action: PhysicianSignoff["action"]): PhysicianSignoff {
  const entry: PhysicianSignoff = { caseId, physicianId, timestamp: new Date().toISOString(), action };
  signoffLog.push(entry);
  if (signoffLog.length > 5000) signoffLog.splice(0, signoffLog.length - 5000);
  return entry;
}

export function getSignoffLog(limit = 100): PhysicianSignoff[] {
  return signoffLog.slice(-limit);
}

export function generateSOAPNote(result: {
  symptoms: string;
  diagnosis: string;
  plan: string;
  vitals?: string;
}): string {
  return [
    `S: ${result.symptoms}`,
    `O: ${result.vitals || "Limited (telehealth encounter — no physical examination performed)"}`,
    `A: ${result.diagnosis}`,
    `P: ${result.plan}`,
    ``,
    `Note: This encounter was conducted via telehealth. Physical examination was limited.`,
    `Generated: ${new Date().toISOString()}`,
  ].join("\n");
}

export function freezeRecord<T extends object>(record: T): Readonly<T> {
  return Object.freeze(record);
}
