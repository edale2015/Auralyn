import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

const followUpQueue: Array<{
  patientId: string;
  scheduledAt: string;
  followUpTime: string;
  severity: string;
  message: string;
  status: "pending" | "sent" | "cancelled";
}> = [];

export const followUpAgent: Agent = {
  name: "followup",
  priority: 50,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();

    if (!ctx.patientId) {
      logAgent("followup", { scheduled: false, reason: "no patient ID" }, Date.now() - start);
      return { scheduled: false, reason: "No patient ID provided" };
    }

    const severity = priorResults.triage?.severity || "low";
    const alert = priorResults.safety?.alert;

    let delayHours = 24;
    let message = "Checking in — are your symptoms improving?";

    if (alert === "ER_NOW" || severity === "critical") {
      delayHours = 2;
      message = "This is a critical follow-up. Please confirm you have reached the emergency department.";
    } else if (severity === "high") {
      delayHours = 6;
      message = "Checking in — have you been seen by a physician? How are you feeling?";
    } else if (severity === "moderate") {
      delayHours = 12;
      message = "Checking in — are your symptoms improving? If they've worsened, please seek care.";
    }

    const now = new Date();
    const followUpTime = new Date(now.getTime() + delayHours * 60 * 60 * 1000).toISOString();

    const entry = {
      patientId: ctx.patientId,
      scheduledAt: now.toISOString(),
      followUpTime,
      severity,
      message,
      status: "pending" as const,
    };
    followUpQueue.push(entry);
    if (followUpQueue.length > 500) followUpQueue.splice(0, followUpQueue.length - 500);

    const result = {
      scheduled: true,
      scheduledTime: `${delayHours}h`,
      followUpTime,
      message,
    };

    publish("followup:scheduled", { patientId: ctx.patientId, followUpTime, severity });

    logAgent("followup", { scheduled: true, delayHours, severity }, Date.now() - start);
    return result;
  },
};

export function getFollowUpQueue(limit = 50) {
  return followUpQueue.slice(-limit);
}

export function cancelFollowUp(patientId: string): boolean {
  const entry = followUpQueue.find((e) => e.patientId === patientId && e.status === "pending");
  if (entry) {
    entry.status = "cancelled";
    return true;
  }
  return false;
}
