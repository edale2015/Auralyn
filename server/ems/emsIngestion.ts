/**
 * EMS Ingestion — incoming ambulance call pipeline
 * Normalizes EMS calls into standard patient format for pre-arrival triage
 */

export interface EMSCall {
  id:           string;
  vitals:       { hr: number; spo2: number; temp?: number; systolicBP?: number; sbp?: number; rr?: number };
  symptoms:     string[];
  etaMinutes:   number;
  location?:    { lat: number; lng: number };
  chiefComplaint?: string;
  ageEstimate?:  number;
  crewNotes?:    string;
}

export interface IngestedEMSPatient {
  id:           string;
  vitals:       { hr: number; spo2: number; temp: number; systolicBP: number; rr: number };
  symptoms:     string[];
  etaMinutes:   number;
  location?:    { lat: number; lng: number };
  chiefComplaint?: string;
  age?:          number;
  ingestedAt:    string;
  source:        "EMS";
}

const emsLog: IngestedEMSPatient[] = [];

export function ingestEMSCall(call: EMSCall): IngestedEMSPatient {
  const patient: IngestedEMSPatient = {
    id:           call.id,
    vitals: {
      hr:         call.vitals.hr,
      spo2:       call.vitals.spo2,
      temp:       call.vitals.temp      ?? 98.6,
      systolicBP: call.vitals.systolicBP ?? call.vitals.sbp ?? 120,
      rr:         call.vitals.rr        ?? 16,
    },
    symptoms:      call.symptoms,
    etaMinutes:    call.etaMinutes,
    location:      call.location,
    chiefComplaint:call.chiefComplaint,
    age:           call.ageEstimate,
    ingestedAt:    new Date().toISOString(),
    source:        "EMS",
  };

  if (emsLog.length >= 200) emsLog.shift();
  emsLog.push(patient);
  return patient;
}

export function ingestBatch(calls: EMSCall[]): IngestedEMSPatient[] {
  return calls.map(ingestEMSCall);
}

export function getEMSLog(): IngestedEMSPatient[] { return [...emsLog]; }
