import { mapCaseToEngineState, type MappedEngineState } from "./chatEngineStateMapper";
import { normalizeEngineTrace, type NormalizedTrace } from "./chatEngineTraceNormalizer";
import type { CaseRecord } from "../../types/case";

export interface AdapterV2Result {
  state: MappedEngineState;
  engineResult: any;
  trace: NormalizedTrace;
  durationMs: number;
}

export async function runEngineAdapterV2(caseRecord: CaseRecord): Promise<AdapterV2Result> {
  const start = Date.now();
  const state = mapCaseToEngineState(caseRecord);

  const { runGenericComplaintV1 } = await import("../complaintEngines");
  const caseState = {
    ccId: state.complaintId,
    answers: state.answers,
    patientAge: state.patientAge,
    patientSex: state.patientSex,
  } as any;

  const engineResult = await runGenericComplaintV1(caseState, state.complaintId);
  const trace = normalizeEngineTrace(engineResult, caseRecord.caseId);
  const durationMs = Date.now() - start;

  return { state, engineResult, trace, durationMs };
}
