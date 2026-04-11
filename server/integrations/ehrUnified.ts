import { sendToECWEncounter, type ECWPayload } from "./ecwAdapter";
import { writeAllEHRs, summarizeWriteResults } from "./ehrRouter";
import type { EhrWritePayload, EhrSystem } from "./ehr/types";

export interface EHRWritePayload {
  patientId: string;
  disposition: string;
  vitals?: Record<string, unknown>;
  note?: string;
  traceId?: string;
  [key: string]: unknown;
}

export async function writeEHRAll(data: EHRWritePayload): Promise<{ epic: string; ecw: string; athena: string }> {
  const results = await writeAllEHRs(
    {
      patientId: data.patientId,
      disposition: data.disposition,
      note: data.note,
      vitals: data.vitals,
      traceId: data.traceId,
    } as EhrWritePayload,
    {
      epic: process.env.EPIC_TOKEN,
      athena: process.env.ATHENA_TOKEN,
    }
  );

  const summary = summarizeWriteResults(results);
  return { epic: summary.epic, ecw: summary.ecw, athena: summary.athena };
}

export async function writeEHRPrimary(data: EHRWritePayload): Promise<{ ecw: string }> {
  try {
    await sendToECWEncounter(data as ECWPayload);
    return { ecw: "ok" };
  } catch {
    return { ecw: "failed" };
  }
}
