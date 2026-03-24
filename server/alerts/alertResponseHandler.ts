import { auditLog } from "../security/auditLogger";

type PhysicianAction = "approve" | "override" | "escalate" | "unknown";

export interface AlertResponse {
  action: PhysicianAction;
  caseId: string;
  handledAt: string;
  success: boolean;
  message: string;
}

const pendingAlerts = new Map<string, { caseId: string; createdAt: number }>();

export function registerAlertCase(caseId: string): void {
  pendingAlerts.set(caseId, { caseId, createdAt: Date.now() });
}

function parseAction(text: string): PhysicianAction {
  const t = text.trim();
  if (t === "1" || /approve/i.test(t)) return "approve";
  if (t === "2" || /override/i.test(t)) return "override";
  if (t === "3" || /escalat/i.test(t)) return "escalate";
  return "unknown";
}

export async function handlePhysicianReply(text: string, caseId: string): Promise<AlertResponse> {
  const action = parseAction(text);
  const handledAt = new Date().toISOString();

  auditLog({
    actor: "physician_alert_response",
    action: `physician_${action}`,
    entityType: "case",
    entityId: caseId,
    details: { replyText: text, action },
  });

  pendingAlerts.delete(caseId);

  const messages: Record<PhysicianAction, string> = {
    approve: `Case ${caseId} approved — AI plan authorized.`,
    override: `Case ${caseId} override recorded — AI plan superseded by physician.`,
    escalate: `Case ${caseId} escalated — urgent review flagged.`,
    unknown: `Reply not recognized. Use: 1=Approve, 2=Override, 3=Escalate`,
  };

  return { action, caseId, handledAt, success: action !== "unknown", message: messages[action] };
}

export function approveCase(caseId: string): Promise<AlertResponse> {
  return handlePhysicianReply("1", caseId);
}

export function overrideCase(caseId: string): Promise<AlertResponse> {
  return handlePhysicianReply("2", caseId);
}

export function escalateCase(caseId: string): Promise<AlertResponse> {
  return handlePhysicianReply("3", caseId);
}

export function listPendingAlerts(): Array<{ caseId: string; createdAt: number }> {
  return [...pendingAlerts.values()];
}
