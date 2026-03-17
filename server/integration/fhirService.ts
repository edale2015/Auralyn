export interface FHIRPatient {
  resourceType: "Patient";
  id: string;
  name: { given: string[]; family: string }[];
  gender: string;
  birthDate: string;
  telecom?: { system: string; value: string }[];
}

export interface FHIREncounter {
  resourceType: "Encounter";
  id: string;
  status: "planned" | "arrived" | "triaged" | "in-progress" | "finished" | "cancelled";
  class: { code: string; display: string };
  subject: { reference: string };
  reasonCode?: { text: string }[];
  period?: { start: string; end?: string };
  diagnosis?: { condition: { display: string }; rank: number }[];
}

export interface FHIRObservation {
  resourceType: "Observation";
  id: string;
  status: "registered" | "preliminary" | "final" | "amended";
  code: { coding: { system: string; code: string; display: string }[]; text: string };
  subject: { reference: string };
  valueQuantity?: { value: number; unit: string };
  valueString?: string;
  effectiveDateTime: string;
}

export interface EHRRecord {
  patients: FHIRPatient[];
  encounters: FHIREncounter[];
  observations: FHIRObservation[];
}

export class FHIRService {
  private patients: FHIRPatient[] = [];
  private encounters: FHIREncounter[] = [];
  private observations: FHIRObservation[] = [];
  private connected: boolean = false;
  private ehrUrl: string = "";

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    this.patients = [
      { resourceType: "Patient", id: "pt_001", name: [{ given: ["Sarah"], family: "Mitchell" }], gender: "female", birthDate: "1985-03-15", telecom: [{ system: "phone", value: "555-0101" }] },
      { resourceType: "Patient", id: "pt_002", name: [{ given: ["James"], family: "Rodriguez" }], gender: "male", birthDate: "1972-08-22", telecom: [{ system: "phone", value: "555-0102" }] },
      { resourceType: "Patient", id: "pt_003", name: [{ given: ["Emily"], family: "Chen" }], gender: "female", birthDate: "1990-11-07", telecom: [{ system: "email", value: "emily.chen@email.com" }] },
      { resourceType: "Patient", id: "pt_004", name: [{ given: ["Robert"], family: "Thompson" }], gender: "male", birthDate: "1968-05-30" },
      { resourceType: "Patient", id: "pt_005", name: [{ given: ["Maria"], family: "Santos" }], gender: "female", birthDate: "1995-01-12" },
    ];

    const now = new Date().toISOString();
    this.encounters = [
      { resourceType: "Encounter", id: "enc_001", status: "finished", class: { code: "AMB", display: "Ambulatory" }, subject: { reference: "Patient/pt_001" }, reasonCode: [{ text: "Acute pharyngitis" }], period: { start: now, end: now }, diagnosis: [{ condition: { display: "Strep Throat" }, rank: 1 }] },
      { resourceType: "Encounter", id: "enc_002", status: "in-progress", class: { code: "AMB", display: "Ambulatory" }, subject: { reference: "Patient/pt_002" }, reasonCode: [{ text: "Chronic sinusitis" }], period: { start: now } },
      { resourceType: "Encounter", id: "enc_003", status: "triaged", class: { code: "EMER", display: "Emergency" }, subject: { reference: "Patient/pt_003" }, reasonCode: [{ text: "Severe vertigo" }], period: { start: now } },
      { resourceType: "Encounter", id: "enc_004", status: "finished", class: { code: "AMB", display: "Ambulatory" }, subject: { reference: "Patient/pt_004" }, reasonCode: [{ text: "Hearing loss evaluation" }], period: { start: now, end: now } },
    ];

    this.observations = [
      { resourceType: "Observation", id: "obs_001", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8310-5", display: "Body temperature" }], text: "Temperature" }, subject: { reference: "Patient/pt_001" }, valueQuantity: { value: 38.5, unit: "°C" }, effectiveDateTime: now },
      { resourceType: "Observation", id: "obs_002", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }], text: "Heart Rate" }, subject: { reference: "Patient/pt_001" }, valueQuantity: { value: 92, unit: "bpm" }, effectiveDateTime: now },
      { resourceType: "Observation", id: "obs_003", status: "final", code: { coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure" }], text: "Blood Pressure" }, subject: { reference: "Patient/pt_002" }, valueString: "140/90 mmHg", effectiveDateTime: now },
      { resourceType: "Observation", id: "obs_004", status: "preliminary", code: { coding: [{ system: "http://loinc.org", code: "18262-6", display: "LDL Cholesterol" }], text: "LDL" }, subject: { reference: "Patient/pt_004" }, valueQuantity: { value: 145, unit: "mg/dL" }, effectiveDateTime: now },
    ];

    this.connected = true;
    this.ehrUrl = "https://fhir.demo.auralyn.ai/r4";
  }

  getPatients(): FHIRPatient[] { return this.patients; }

  getPatient(id: string): FHIRPatient | undefined { return this.patients.find((p) => p.id === id); }

  createPatient(data: Partial<FHIRPatient>): FHIRPatient {
    const patient: FHIRPatient = {
      resourceType: "Patient",
      id: `pt_${Date.now().toString(36)}`,
      name: data.name || [{ given: ["Unknown"], family: "Patient" }],
      gender: data.gender || "unknown",
      birthDate: data.birthDate || "2000-01-01",
      telecom: data.telecom,
    };
    this.patients.push(patient);
    return patient;
  }

  getEncounters(patientId?: string): FHIREncounter[] {
    if (patientId) return this.encounters.filter((e) => e.subject.reference === `Patient/${patientId}`);
    return this.encounters;
  }

  createEncounterFromBrain(patientId: string, brainResult: any): FHIREncounter {
    const enc: FHIREncounter = {
      resourceType: "Encounter",
      id: `enc_${Date.now().toString(36)}`,
      status: "finished",
      class: { code: brainResult?.decision?.disposition === "er" ? "EMER" : "AMB", display: brainResult?.decision?.disposition === "er" ? "Emergency" : "Ambulatory" },
      subject: { reference: `Patient/${patientId}` },
      reasonCode: [{ text: brainResult?.decision?.diagnosis || "Clinical assessment" }],
      period: { start: new Date().toISOString(), end: new Date().toISOString() },
      diagnosis: brainResult?.diagnoses?.slice(0, 3).map((d: any, i: number) => ({ condition: { display: d.diagnosis }, rank: i + 1 })),
    };
    this.encounters.push(enc);
    return enc;
  }

  getObservations(patientId?: string): FHIRObservation[] {
    if (patientId) return this.observations.filter((o) => o.subject.reference === `Patient/${patientId}`);
    return this.observations;
  }

  createObservation(data: Partial<FHIRObservation>): FHIRObservation {
    const obs: FHIRObservation = {
      resourceType: "Observation",
      id: `obs_${Date.now().toString(36)}`,
      status: data.status || "final",
      code: data.code || { coding: [{ system: "http://loinc.org", code: "unknown", display: "Unknown" }], text: "Unknown" },
      subject: data.subject || { reference: "Patient/unknown" },
      effectiveDateTime: new Date().toISOString(),
      ...(data.valueQuantity && { valueQuantity: data.valueQuantity }),
      ...(data.valueString && { valueString: data.valueString }),
    };
    this.observations.push(obs);
    return obs;
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      ehrUrl: this.ehrUrl,
      version: "FHIR R4",
      resources: {
        patients: this.patients.length,
        encounters: this.encounters.length,
        observations: this.observations.length,
      },
    };
  }

  getSummary() {
    return {
      ...this.getConnectionStatus(),
      encountersByStatus: {
        finished: this.encounters.filter((e) => e.status === "finished").length,
        inProgress: this.encounters.filter((e) => e.status === "in-progress").length,
        triaged: this.encounters.filter((e) => e.status === "triaged").length,
      },
    };
  }
}

export const fhirService = new FHIRService();
