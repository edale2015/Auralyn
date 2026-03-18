export type AlertInput = {
  type: "complaint" | "physician" | "clinic";
  entityId: string;
  severity: "watch" | "critical";
  message: string;
  createdAt?: string;
};

export type Alert = AlertInput & { id: number; createdAt: string };

const alertStore: Alert[] = [];
let alertId = 0;

export function createAlert(input: AlertInput): Alert {
  alertId++;
  const row: Alert = {
    ...input,
    id: alertId,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  alertStore.unshift(row);
  return row;
}

export function listAlerts(severity?: "watch" | "critical"): Alert[] {
  if (!severity) return [...alertStore];
  return alertStore.filter(a => a.severity === severity);
}

export function seedDemoAlerts() {
  if (alertStore.length > 0) return 0;

  const demos: AlertInput[] = [
    { type: "complaint", entityId: "dizziness", severity: "critical", message: "Dizziness override rate at 19% — exceeds 15% threshold" },
    { type: "physician", entityId: "dr-smith", severity: "critical", message: "Dr. Smith override rate at 20%, satisfaction 3.9 — below threshold" },
    { type: "clinic", entityId: "clinicC", severity: "critical", message: "Clinic C margin at 22.4% — below 25% critical threshold" },
    { type: "complaint", entityId: "chest_pain", severity: "watch", message: "Chest pain escalation rate at 15% — approaching 20% critical threshold" },
    { type: "physician", entityId: "dr-kim", severity: "watch", message: "Dr. Kim override rate at 11% — above 10% watch threshold" },
    { type: "clinic", entityId: "clinicD", severity: "watch", message: "Clinic D override rate at 9% — approaching 10% watch threshold" },
  ];

  for (const d of demos) createAlert(d);
  return demos.length;
}
