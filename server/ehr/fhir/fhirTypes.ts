export interface FhirPatient {
  resourceType: "Patient";
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  name?: Array<{ family?: string; given?: string[] }>;
  telecom?: Array<{ system?: string; value?: string }>;
  birthDate?: string;
  gender?: string;
}

export interface FhirEncounter {
  resourceType: "Encounter";
  id?: string;
  status: string;
  class?: { system?: string; code?: string };
  subject: { reference: string };
  reasonCode?: Array<{ text?: string }>;
}

export interface FhirObservation {
  resourceType: "Observation";
  status: string;
  code: { text: string };
  subject: { reference: string };
  valueString?: string;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "transaction" | "searchset";
  entry: Array<{ resource: FhirPatient | FhirEncounter | FhirObservation }>;
}
