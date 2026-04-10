import { broadcast } from "./controlBus";
import { recordReset, recordAlert, setActiveModel } from "./systemState";

export interface ReportSummary {
  summary: string;
  generatedAt: string;
  metrics: unknown;
}

export function resetSystem(): void {
  recordReset();
  broadcast("reset", { resetAt: new Date().toISOString() });
  console.log("[SystemControls] System reset triggered");
}

export function switchActiveModel(version: string): void {
  setActiveModel(version);
  broadcast("model_switch", { version, switchedAt: new Date().toISOString() });
  console.log(`[SystemControls] Model switched to ${version}`);
}

export function repairTemplate(templateId: string): void {
  broadcast("template_repair", { templateId, repairedAt: new Date().toISOString() });
  console.log(`[SystemControls] Repairing template: ${templateId}`);
}

export function triggerGlobalAlert(msg: string): void {
  recordAlert();
  broadcast("alert", { message: msg, triggeredAt: new Date().toISOString(), level: "CRITICAL" });
  console.error(`[SystemControls] 🚨 ALERT: ${msg}`);
}

export function generateReport(state: unknown): ReportSummary {
  return {
    summary: "System stable",
    generatedAt: new Date().toISOString(),
    metrics: state,
  };
}
