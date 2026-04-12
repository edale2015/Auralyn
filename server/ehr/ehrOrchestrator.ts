/**
 * EHR Orchestrator — routes encounters to the correct EHR adapter.
 * In production: Playwright-based automation or FHIR API calls.
 * In development/test: stub mode (no browser launch).
 */

export interface EHRSubmitResult {
  success:  boolean;
  system:   string;
  stub:     boolean;
  traceId?: string;
  error?:   string;
}

async function runEHRAction(
  action: string,
  payload: Record<string, unknown>
): Promise<EHRSubmitResult> {
  // Stub: In production, replace with Playwright automation or FHIR REST calls
  console.log(`[EHR] Action=${action} diagnosis=${payload.diagnosis ?? "?"} disposition=${payload.disposition ?? "?"}`);
  return {
    success: true,
    system:  action.split("_")[0],
    stub:    true,
    traceId: (payload.traceId as string | undefined),
  };
}

export async function submitEncounter(
  data: Record<string, unknown>
): Promise<EHRSubmitResult> {
  const system = (process.env.EHR_SYSTEM ?? "athena").toLowerCase();

  const actionMap: Record<string, string> = {
    athena: "athena_submit",
    epic:   "epic_submit",
    ecw:    "ecw_submit",
  };

  const action = actionMap[system];
  if (!action) {
    return { success: false, system, stub: true, error: `Unsupported EHR system: ${system}` };
  }

  return runEHRAction(action, data);
}
