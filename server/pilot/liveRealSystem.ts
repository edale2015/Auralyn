import { runFinalPipeline } from "../clinical/finalPipeline";
import { writeEHRAll } from "../integrations/ehrUnified";
import { processRevenue } from "../revenue/fullRevenue";
import { publishUpdate } from "../control/systemBus";

export interface LiveSystemResult {
  disposition: string;
  revenue: ReturnType<typeof processRevenue>;
  ehr: { epic: string; ecw: string };
}

export async function runLiveSystem(patient: {
  patientId: string;
  complaint: string;
  insurance?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<LiveSystemResult> {
  const triage = runFinalPipeline(patient as any);
  const disposition = triage.safetyDisposition;

  const ehr = await writeEHRAll({
    patientId: patient.patientId,
    disposition,
    vitals: patient.vitals,
  });

  const revenue = processRevenue(patient, disposition);

  publishUpdate({ patientId: patient.patientId, disposition, revenue });

  return { disposition, revenue, ehr };
}
