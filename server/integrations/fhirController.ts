import type { PipelineResult } from "../pipeline/unifiedClinicalPipeline";

export interface FhirEncounterResource {
  resourceType: "Encounter";
  status: string;
  class: { code: string };
  diagnosis: Array<{
    condition: { display: string };
    rank: number;
  }>;
  extension: Array<{
    url: string;
    valueString: string;
  }>;
}

export function buildEncounter(result: PipelineResult): FhirEncounterResource {
  return {
    resourceType: "Encounter",
    status: "finished",
    class: { code: mapTriageToEncounterClass(result.triage) },
    diagnosis: result.diagnosis
      ? [
          {
            condition: { display: result.diagnosis },
            rank: 1,
          },
        ]
      : [],
    extension: [
      {
        url: "http://auralyn.io/fhir/triage-level",
        valueString: result.triage || "unknown",
      },
      {
        url: "http://auralyn.io/fhir/safety-override",
        valueString: String(result.safetyOverride),
      },
    ],
  };
}

function mapTriageToEncounterClass(triage: string | null): string {
  switch (triage) {
    case "er_now":
      return "EMER";
    case "urgent_care":
      return "EMER";
    case "telemed_now":
      return "VR";
    case "office_followup":
      return "AMB";
    case "self_care":
      return "HH";
    default:
      return "AMB";
  }
}
