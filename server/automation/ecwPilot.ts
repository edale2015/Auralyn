import { runUIAutomation, type UITemplate, type AutomationResult } from "./uiEngine";
import { sendToECWEncounter } from "../integrations/ecwAdapter";
import { sendSlackAlert } from "../monitoring/alerts";

export async function safeECWAutomation(template: UITemplate): Promise<AutomationResult> {
  try {
    return await runUIAutomation(template);
  } catch (e: any) {
    console.error("[ECW] Automation failure:", e?.message);
    await sendSlackAlert(`ECW automation failed: ${e?.message ?? "unknown error"}`);
    return { ok: false, time: 0, error: e?.message };
  }
}

export async function dualWriteEHR(data: {
  patientId: string;
  disposition: string;
  vitals?: Record<string, unknown>;
  template?: UITemplate;
}): Promise<{ api: string; ui: string }> {
  const results = await Promise.allSettled([
    sendToECWEncounter({ patientId: data.patientId, disposition: data.disposition, vitals: data.vitals }),
    data.template ? runUIAutomation(data.template) : Promise.resolve({ ok: true, time: 0 }),
  ]);
  return {
    api: results[0].status === "fulfilled" ? "ok" : "failed",
    ui:  results[1].status === "fulfilled" ? "ok" : "failed",
  };
}

export interface ECWPilotResult {
  disposition: string;
  automation: AutomationResult;
}

export async function ecwPilot(
  patient: { patientId: string; complaint: string; [key: string]: unknown },
  template: UITemplate
): Promise<ECWPilotResult> {
  const { runFinalPipeline } = await import("../clinical/finalPipeline");
  const triage = runFinalPipeline(patient as any);
  const automation = await safeECWAutomation(template);
  return { disposition: triage.safetyDisposition, automation };
}
