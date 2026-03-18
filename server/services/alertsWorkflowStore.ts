export interface WorkflowAlert {
  id: number;
  type: string;
  entityId: string;
  severity: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

const alertWfStore: WorkflowAlert[] = [];
let alertWfId = 0;

export function createWorkflowAlert(payload: {
  type: string;
  entityId: string;
  severity: string;
  message: string;
}): WorkflowAlert {
  alertWfId++;
  const row: WorkflowAlert = {
    id: alertWfId,
    type: payload.type,
    entityId: payload.entityId,
    severity: payload.severity,
    message: payload.message,
    createdAt: new Date().toISOString(),
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
  };
  alertWfStore.unshift(row);
  return row;
}

export function listWorkflowAlerts(includeAcknowledged = true): WorkflowAlert[] {
  if (includeAcknowledged) return [...alertWfStore];
  return alertWfStore.filter(a => !a.acknowledged);
}

export function acknowledgeWorkflowAlert(id: number, userId: string): WorkflowAlert | null {
  const alert = alertWfStore.find(a => a.id === id);
  if (!alert) return null;
  alert.acknowledged = true;
  alert.acknowledgedBy = userId;
  alert.acknowledgedAt = new Date().toISOString();
  return alert;
}

export function seedWorkflowAlerts(): number {
  if (alertWfStore.length > 0) return 0;
  const demos = [
    { type: "complaint", entityId: "dizziness", severity: "critical", message: "Dizziness override rate at 19% — exceeds 15% threshold" },
    { type: "physician", entityId: "dr-smith", severity: "critical", message: "Dr. Smith override rate at 20%, satisfaction 3.9 — below threshold" },
    { type: "clinic", entityId: "clinicC", severity: "critical", message: "Clinic C margin at 22.4% — below 25% critical threshold" },
    { type: "complaint", entityId: "chest_pain", severity: "watch", message: "Chest pain escalation rate at 15% — approaching critical" },
  ];
  for (const d of demos) createWorkflowAlert(d);
  return demos.length;
}
