/**
 * Action Orchestrator — coordinates interventions → orders → alerts → escalations
 * Single entry point for executing the full intervention pipeline on a patient.
 */

import { generateInterventions }  from "../engines/interventionEngine";
import { executeOrder }           from "./orderExecutor";
import { sendAlert }              from "./alertEngine";
import { escalatePatient }        from "./escalationEngine";

export interface OrchestratorPatient {
  id:         string;
  name?:      string;
  riskScore?: number;
  flags?:     string[];
  vitals:     {
    hr:         number;
    spo2:       number;
    temp:       number;
    systolicBP: number;
    rr?:        number;
  };
}

export interface ActionResult {
  patientId:    string;
  interventions:ReturnType<typeof generateInterventions>["interventions"];
  ordersPlaced: any[];
  alerts:       any[];
  escalation?:  any;
  riskLevel:    string;
  sepsisCriteria:boolean;
  durationMs:   number;
}

export async function runInterventions(patient: OrchestratorPatient): Promise<ActionResult> {
  const t0     = Date.now();
  const triage = generateInterventions(patient.vitals);

  const ordersPlaced: any[] = [];
  const alerts:       any[] = [];
  let escalation: any       = null;

  // Execute all interventions in parallel where safe, serial for escalations
  const actions = triage.interventions;

  await Promise.all(
    actions.map(async (action) => {
      switch (action.type) {
        case "lab":
        case "med":
          try {
            const order = await executeOrder(action.action, patient.id);
            ordersPlaced.push(order);
          } catch (err) {
            console.error(`[ActionOrchestrator] Order failed: ${action.action}`, err);
          }
          break;

        case "alert":
          try {
            const level = action.priority === "critical" ? "critical" :
                          action.priority === "high"     ? "high" :
                          action.priority === "medium"   ? "warning" : "info";
            const alert = await sendAlert(action.action, level as any, patient.id, "intervention-engine");
            alerts.push(alert);
          } catch (err) {
            console.error(`[ActionOrchestrator] Alert failed: ${action.action}`, err);
          }
          break;

        case "escalation":
          // Escalation runs after labs/alerts (priority ordering handled below)
          break;
      }
    })
  );

  // Escalate if needed (runs after other actions to gather full context)
  const escalationAction = actions.find((a) => a.type === "escalation" && a.priority === "critical");
  if (escalationAction || triage.riskLevel === "critical") {
    escalation = await escalatePatient({
      id:        patient.id,
      name:      patient.name,
      riskScore: patient.riskScore ?? triage.newsScore * 2,
      flags:     patient.flags ?? triage.interventions.map((i) => i.action.slice(0, 30)),
      reason:    escalationAction?.action ?? triage.prediction,
    });
  }

  return {
    patientId:     patient.id,
    interventions: actions,
    ordersPlaced,
    alerts,
    escalation,
    riskLevel:     triage.riskLevel,
    sepsisCriteria:triage.sepsisCriteria,
    durationMs:    Date.now() - t0,
  };
}
