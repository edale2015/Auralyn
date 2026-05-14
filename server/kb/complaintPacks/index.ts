/**
 * index.ts — Complaint Pack Registry
 * All registered ComplaintPacks, indexed by complaint ID.
 */

export { URIRespiratoryPack } from "./uri-respiratory";
export { ChestPainPack }      from "./chest-pain";
export { GUUTIPack }          from "./gu-uti";
export { HeadachePack }       from "./headache";
export { AbdominalPainPack }  from "./abdominal-pain";
export { MSKBackPainPack, DermatologyPack, PsychiatricPack } from "./remaining-packs";

import { URIRespiratoryPack } from "./uri-respiratory";
import { ChestPainPack }      from "./chest-pain";
import { GUUTIPack }          from "./gu-uti";
import { HeadachePack }       from "./headache";
import { AbdominalPainPack }  from "./abdominal-pain";
import { MSKBackPainPack, DermatologyPack, PsychiatricPack } from "./remaining-packs";
import type { ComplaintPack } from "./types";

export type { ComplaintPack, ExtractedClinicalState, TriageResult, AnswerEntry } from "./types";

export const COMPLAINT_PACK_REGISTRY: Record<string, ComplaintPack> = {
  // URI / Respiratory family
  "uri_respiratory":           URIRespiratoryPack,
  "sore_throat":               URIRespiratoryPack,
  "cough":                     URIRespiratoryPack,
  "ent_sinus_pressure":        URIRespiratoryPack,
  "earache":                   URIRespiratoryPack,
  "pulm_shortness_of_breath":  URIRespiratoryPack,

  // Chest pain
  "chest_pain":                ChestPainPack,
  "cardio_palpitations":       ChestPainPack,

  // GU / UTI
  "gu_uti_symptoms":           GUUTIPack,

  // Headache / Neuro
  "neuro_headache":            HeadachePack,
  "dizziness":                 HeadachePack,

  // Abdominal pain
  "abdominal_pain":            AbdominalPainPack,

  // Musculoskeletal / Back pain
  "msk_back_pain":             MSKBackPainPack,
  "musculoskeletal":           MSKBackPainPack,

  // Dermatology / Rash
  "derm_rash":                 DermatologyPack,
  "rash":                      DermatologyPack,

  // Psychiatric / Behavioral
  "psychiatric":               PsychiatricPack,
  "behavioral_health":         PsychiatricPack,
  "anxiety":                   PsychiatricPack,
  "depression":                PsychiatricPack,
};

/**
 * Get the complaint pack for a given complaint ID.
 * Returns undefined if no pack is registered.
 */
export function getComplaintPack(complaintId: string): ComplaintPack | undefined {
  return COMPLAINT_PACK_REGISTRY[complaintId];
}

/**
 * List all registered complaint IDs.
 */
export function listRegisteredComplaints(): string[] {
  return Object.keys(COMPLAINT_PACK_REGISTRY);
}
