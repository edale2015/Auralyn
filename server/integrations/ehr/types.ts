export type EhrSystem = "ecw" | "athena" | "epic";

export interface EhrPatientContext {
  patientId: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  sex?: string;
  medications?: string[];
  allergies?: string[];
  problems?: string[];
  vitals?: Record<string, unknown>;
  raw?: unknown;
}

export interface EhrWritePayload {
  patientId: string;
  disposition?: string;
  note?: string;
  vitals?: Record<string, unknown>;
  diagnosisCodes?: string[];
  cptCode?: string;
  traceId?: string;
  raw?: unknown;
  [key: string]: unknown;
}

export interface EhrAdapter {
  system: EhrSystem;
  getPatientContext(patientId: string, token?: string): Promise<EhrPatientContext>;
  writeEncounter(payload: EhrWritePayload, token?: string): Promise<unknown>;
  writeObservation?(payload: EhrWritePayload, token?: string): Promise<unknown>;
  ping(token?: string): Promise<boolean>;
}

export interface EhrWriteResults {
  ecw: PromiseSettledResult<unknown>;
  athena: PromiseSettledResult<unknown>;
  epic: PromiseSettledResult<unknown>;
}

export interface EhrHealthStatus {
  ecw: boolean;
  athena: boolean;
  epic: boolean;
}
