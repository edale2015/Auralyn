import { subscribe, getBusStats } from "./bus";
import { Topics } from "./topics";
import { syncEncounterToFhir } from "../ehr/fhir/fhirService";

export function startEventWorkers(): void {
  subscribe(Topics.FhirSyncRequested, async (envelope) => {
    const { clinicId, encounter, patient } = envelope.payload as any;
    if (!encounter || !patient) {
      console.warn("[FhirWorker] Missing encounter or patient in payload, skipping");
      return;
    }
    const result = await syncEncounterToFhir({ clinicId, encounter, patient });
    if (result.skipped) {
      console.log("[FhirWorker] FHIR sync skipped:", result.reason);
    } else if (!result.ok) {
      console.error("[FhirWorker] FHIR sync failed:", result.error);
    } else {
      console.log(`[FhirWorker] Synced encounter → FHIR patient ${result.fhirPatientId}, resources=${result.resourcesCreated}`);
    }
  });

  subscribe(Topics.MedicationSafetyRequested, async (envelope) => {
    const { proposedDrug, clinicId } = envelope.payload as any;
    console.log(`[MedWorker] Async med-safety requested for drug="${proposedDrug}" clinic="${clinicId}"`);
  });

  subscribe(Topics.EncounterCreated, (envelope) => {
    console.log(`[ClinicalWorker] Encounter created: id=${(envelope.payload as any).encounterId}`);
  });

  subscribe(Topics.TriageCompleted, (envelope) => {
    console.log(`[ClinicalWorker] Triage completed: id=${(envelope.payload as any).encounterId}`);
  });

  subscribe(Topics.AuditEvent, (envelope) => {
    console.log(`[AuditWorker] Audit: ${JSON.stringify(envelope.payload).slice(0, 120)}`);
  });

  console.log("[EventBus] Workers registered:", getBusStats().subscribedTopics, "topics");
}
