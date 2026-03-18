export type FhirObservation = {
  code: string;
  value: string | number | boolean;
};

export type FhirEncounterUpsert = {
  patientId: string;
  encounterId: string;
  complaintText: string;
  observations: FhirObservation[];
  assessment?: string;
  plan?: string;
};

export interface FhirAdapter {
  createOrUpdateEncounter(payload: FhirEncounterUpsert): Promise<{ externalId: string }>;
}

export class MockFhirAdapter implements FhirAdapter {
  async createOrUpdateEncounter(payload: FhirEncounterUpsert) {
    return { externalId: `mock-${payload.encounterId}` };
  }
}
