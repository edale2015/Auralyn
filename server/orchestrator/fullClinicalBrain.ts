/**
 * Full Clinical Brain — integrated multi-patient AI command layer
 * Combines: ranking → deterioration prediction → interventions → learning
 * This is the "hospital OS" entry point.
 */

import { rankPatientsAI, type CommandCenterPatient } from "../command-center/commandCenterAI";
import { handleDeterioration }                        from "../prediction/deteriorationEngine";
import { runInterventions }                           from "../intervention/actionOrchestrator";

export interface ClinicalBrainPatient extends CommandCenterPatient {
  riskScore: number;
  vitals: {
    hr:     number;
    bpSys:  number;
    spo2:   number;
    temp:   number;
    rr?:    number;
    systolicBP?: number;
  };
  trend?: {
    hrTrend?:   number;
    spo2Trend?: number;
    bpTrend?:   number;
  };
}

export interface ClinicalBrainResult {
  patients:     ClinicalBrainPatientResult[];
  summary: {
    total:        number;
    critical:     number;
    highRisk:     number;
    escalated:    number;
    ordersPlaced: number;
  };
  durationMs:   number;
  runAt:        string;
}

export interface ClinicalBrainPatientResult {
  id:            string;
  name?:         string;
  priorityScore: number;
  urgency:       string;
  trendFlags:    string[];
  deterioration: any;
  interventions: any;
  riskLevel:     string;
}

export async function runClinicalBrain(rawPatients: ClinicalBrainPatient[]): Promise<ClinicalBrainResult> {
  const t0 = Date.now();

  // ── Step 1: Priority ranking (trend-aware) ────────────────────────────────
  const ranked = rankPatientsAI(rawPatients);

  // ── Steps 2+3: Deterioration + Interventions (parallel per patient) ────────
  const results = await Promise.all(
    ranked.map(async (patient) => {
      // Normalise vitals (spec uses bpSys, engine uses systolicBP)
      const vitals = {
        hr:         patient.vitals.hr,
        spo2:       patient.vitals.spo2,
        temp:       patient.vitals.temp,
        systolicBP: patient.vitals.systolicBP ?? patient.vitals.bpSys,
        rr:         patient.vitals.rr,
      };

      // Deterioration prediction
      const deterioration = await handleDeterioration({
        id:     patient.id,
        name:   patient.name,
        vitals: { hr: vitals.hr, bpSys: patient.vitals.bpSys, spo2: vitals.spo2, temp: vitals.temp, rr: vitals.rr },
        trend:  patient.trend,
      });

      // Intervention execution (orders + alerts + escalation)
      let interventions: any = null;
      try {
        interventions = await runInterventions({
          id:        patient.id,
          name:      patient.name,
          riskScore: patient.riskScore,
          flags:     deterioration.flags,
          vitals,
        });
      } catch (err) {
        interventions = { error: String(err) };
      }

      return {
        id:            patient.id,
        name:          patient.name,
        priorityScore: patient.priorityScore,
        urgency:       patient.urgency,
        trendFlags:    patient.trendFlags,
        deterioration,
        interventions,
        riskLevel:     deterioration.risk,
      } as ClinicalBrainPatientResult;
    })
  );

  // ── Summary stats ─────────────────────────────────────────────────────────
  const critical     = results.filter((r) => r.riskLevel === "critical").length;
  const highRisk     = results.filter((r) => r.riskLevel === "high").length;
  const escalated    = results.filter((r) => r.interventions?.escalation).length;
  const ordersPlaced = results.reduce((acc, r) => acc + (r.interventions?.ordersPlaced?.length ?? 0), 0);

  return {
    patients: results,
    summary:  { total: results.length, critical, highRisk, escalated, ordersPlaced },
    durationMs: Date.now() - t0,
    runAt:    new Date().toISOString(),
  };
}
