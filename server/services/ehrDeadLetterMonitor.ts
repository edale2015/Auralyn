import { listDeadLetters } from "./ehrDeadLetterService";
import { PRODUCTION_FLAGS } from "../config/productionFlags";

export interface DeadLetterAlert {
  id: string;
  caseId: string;
  ageMinutes: number;
  error: string;
  alertedAt: string;
}

const activeAlerts: DeadLetterAlert[] = [];
const alertedIds = new Set<string>();
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function getActiveDeadLetterAlerts(): DeadLetterAlert[] {
  return [...activeAlerts];
}

export function clearDeadLetterAlert(id: string): boolean {
  const idx = activeAlerts.findIndex(a => a.id === id);
  if (idx === -1) return false;
  activeAlerts.splice(idx, 1);
  return true;
}

export function startDeadLetterMonitor(intervalMs = 60_000): void {
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    const threshold = PRODUCTION_FLAGS.EHR_DEAD_LETTER_ALERT_MINUTES * 60 * 1000;
    const unresolved = listDeadLetters(false);
    const now = Date.now();

    for (const entry of unresolved) {
      const age = now - new Date(entry.createdAt).getTime();
      const ageMin = Math.floor(age / 60_000);

      if (age > threshold && !alertedIds.has(entry.id)) {
        alertedIds.add(entry.id);
        const alert: DeadLetterAlert = {
          id: entry.id,
          caseId: entry.caseId,
          ageMinutes: ageMin,
          error: entry.error,
          alertedAt: new Date().toISOString(),
        };
        activeAlerts.push(alert);
        if (activeAlerts.length > 100) activeAlerts.shift();

        console.error(
          `[EHR-MONITOR] 🚨 CLINICAL ALERT — EHR write for case ${entry.caseId} has been pending ` +
          `${ageMin} minutes (threshold: ${PRODUCTION_FLAGS.EHR_DEAD_LETTER_ALERT_MINUTES} min). ` +
          `Error: ${entry.error}. Physician notification required.`
        );
      }
    }
  }, intervalMs);

  console.log(`[EHR-MONITOR] Dead letter monitor started — alerting after ${PRODUCTION_FLAGS.EHR_DEAD_LETTER_ALERT_MINUTES} minutes`);
}
