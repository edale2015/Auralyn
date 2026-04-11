import type { EhrWritePayload } from "./ehr/types";
import { sendToECWEncounter, type ECWPayload } from "./ecwAdapter";
import { athenaAdapter } from "./athenaAdapter";
import { epicAdapter } from "./epicAdapter";

async function tryRunUIAutomation(template: string): Promise<unknown> {
  try {
    const { runUIAutomation } = await import("../automation/uiEngine");
    return await runUIAutomation(template);
  } catch {
    throw new Error("UI automation unavailable");
  }
}

async function tryRunVisionAgent(page: string, action: string): Promise<unknown> {
  try {
    const { runVisionAgent } = await import("../automation/visionLoop");
    return await (runVisionAgent as any)(page, action);
  } catch {
    throw new Error("Vision agent unavailable");
  }
}

export interface UniversalWriteResult {
  success: boolean;
  tier: "ecw" | "athena" | "epic" | "ui" | "vision" | "failed";
  data?: unknown;
  error?: string;
}

export async function universalWrite(data: EhrWritePayload & { template?: string; page?: string }): Promise<UniversalWriteResult> {
  try {
    const result = await sendToECWEncounter(data as ECWPayload);
    if (!result.success) throw new Error("ECW not configured or write failed");
    return { success: true, tier: "ecw", data: result };
  } catch (ecwErr) {
    try {
      const result = await athenaAdapter.writeEncounter(data, process.env.ATHENA_TOKEN);
      return { success: true, tier: "athena", data: result };
    } catch (athenaErr) {
      try {
        const result = await epicAdapter.writeEncounter(data, process.env.EPIC_TOKEN);
        return { success: true, tier: "epic", data: result };
      } catch (epicErr) {
        try {
          const result = await tryRunUIAutomation(data.template || "default");
          return { success: true, tier: "ui", data: result };
        } catch (uiErr) {
          try {
            const result = await tryRunVisionAgent(data.page || "ehr", "submit");
            return { success: true, tier: "vision", data: result };
          } catch (visionErr) {
            return {
              success: false,
              tier: "failed",
              error: `All EHR write tiers exhausted. Last error: ${visionErr}`,
            };
          }
        }
      }
    }
  }
}
