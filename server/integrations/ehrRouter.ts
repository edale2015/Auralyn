import type { EhrAdapter, EhrSystem, EhrWritePayload, EhrWriteResults, EhrHealthStatus } from "./ehr/types";
import { ecwAdapter } from "./ecwAdapter";
import { athenaAdapter } from "./athenaAdapter";
import { epicAdapter } from "./epicAdapter";

export const EHR_ADAPTERS: Record<EhrSystem, EhrAdapter> = {
  ecw: ecwAdapter,
  athena: athenaAdapter,
  epic: epicAdapter,
};

export const PRIMARY_EHR: EhrSystem = "ecw";

export function getAdapter(system: EhrSystem): EhrAdapter {
  return EHR_ADAPTERS[system];
}

export async function getPatientContextUnified(
  patientId: string,
  preferred: EhrSystem = PRIMARY_EHR,
  token?: string
) {
  return getAdapter(preferred).getPatientContext(patientId, token);
}

export async function writePrimaryEHR(payload: EhrWritePayload, token?: string) {
  return ecwAdapter.writeEncounter(payload, token);
}

export async function writeAllEHRs(
  payload: EhrWritePayload,
  tokenMap?: Partial<Record<EhrSystem, string>>
): Promise<EhrWriteResults> {
  const [ecw, athena, epic] = await Promise.allSettled([
    ecwAdapter.writeEncounter(payload, tokenMap?.ecw),
    athenaAdapter.writeEncounter(payload, tokenMap?.athena),
    epicAdapter.writeEncounter(payload, tokenMap?.epic),
  ]);

  return { ecw, athena, epic };
}

export async function pingAllEHRs(
  tokenMap?: Partial<Record<EhrSystem, string>>
): Promise<EhrHealthStatus> {
  const [ecw, athena, epic] = await Promise.all([
    ecwAdapter.ping(tokenMap?.ecw).catch(() => false),
    athenaAdapter.ping(tokenMap?.athena).catch(() => false),
    epicAdapter.ping(tokenMap?.epic).catch(() => false),
  ]);

  return { ecw, athena, epic };
}

export function summarizeWriteResults(results: EhrWriteResults): Record<EhrSystem, "ok" | "failed"> {
  return {
    ecw: results.ecw.status === "fulfilled" ? "ok" : "failed",
    athena: results.athena.status === "fulfilled" ? "ok" : "failed",
    epic: results.epic.status === "fulfilled" ? "ok" : "failed",
  };
}
