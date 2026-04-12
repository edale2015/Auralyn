/**
 * Multi-Patient Wall Display Stream — ranks all patients + enriches with sepsis + deterioration
 * Broadcasts WALL_DISPLAY_UPDATE for the Command Wall dashboard
 */

import { rankPatients }         from "../triage/scopeAwareTriageEngine";
import { detectSepsisRisk }     from "../sepsis/sepsisEngine";
import { triggerSepsisAlert }   from "../sepsis/sepsisAlertService";
import { detectDeteriorationFromHistory } from "../prediction/deteriorationEngineHelpers";
import { broadcastPatientUpdate } from "../realtime/patientStream";

export interface WallPatient {
  id:         string;
  vitals:     Record<string, any>;
  symptoms?:  string[];
  labs?:      Record<string, any>;
  age?:       number;
  history?:   any[];
  trend?:     Record<string, any>;
  interventions?: string[];
}

export async function updateWallDisplay(patients: WallPatient[]) {
  // Scope-aware triage ranking (NEWS2 + qSOFA)
  const ranked = rankPatients(patients.map((p) => ({
    id:      p.id,
    vitals:  { ...p.vitals, systolicBP: p.vitals.systolicBP ?? p.vitals.spo2 ?? 120 },
    symptoms: p.symptoms,
    age:     p.age,
  })));

  const enriched = await Promise.all(ranked.map(async (r) => {
    const patient = patients.find((x) => x.id === r.patientId)!;

    // Sepsis risk + optional alert
    const sepsis = detectSepsisRisk({
      id:       patient.id,
      vitals:   { ...patient.vitals, systolicBP: patient.vitals.systolicBP ?? patient.vitals.spo2 ?? 120 },
      symptoms: patient.symptoms ?? [],
      labs:     patient.labs ?? {},
      trend:    patient.trend ?? {},
    });
    if (sepsis.highRisk) await triggerSepsisAlert(patient, sepsis);

    // Deterioration from history
    const deterioration = detectDeteriorationFromHistory(patient.history ?? []);

    return {
      ...r,
      sepsisRisk: {
        probability: sepsis.probability,
        highRisk:    sepsis.highRisk,
        factors:     sepsis.factors.slice(0, 3),
        trigger:     sepsis.trigger,
      },
      deterioration,
    };
  }));

  broadcastPatientUpdate({ type: "WALL_DISPLAY_UPDATE", payload: enriched });
  return enriched;
}
