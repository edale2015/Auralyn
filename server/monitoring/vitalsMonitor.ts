/**
 * Vitals Monitor — Real-time vital signs alert evaluation.
 * Companion to existing alertEngine.ts (system-level alerts).
 * This module focuses on patient-level vitals triage.
 */

import { broadcastPatientUpdate } from "../realtime/patientStream";

export interface VitalSigns {
  hr?:         number;   // heart rate bpm
  tempC?:      number;   // temperature Celsius
  tempF?:      number;   // temperature Fahrenheit (converted if provided)
  spo2?:       number;   // oxygen saturation %
  systolicBP?: number;
  diastolicBP?:number;
  rr?:         number;   // respiratory rate
}

export interface VitalsAlert {
  type:     string;
  severity: "low" | "medium" | "high" | "critical";
  value:    number;
  unit:     string;
  message:  string;
}

const THRESHOLDS = {
  hr:          { low: 50, high: 100, critical: 130 },
  tempC:       { low: 36.0, high: 38.0, critical: 39.5 },
  spo2:        { low: 95, critical: 88 },
  systolicBP:  { low: 90, high: 140, critical: 160 },
  rr:          { low: 12, high: 20, critical: 30 },
};

export function evaluateVitals(vitals: VitalSigns): VitalsAlert[] {
  const alerts: VitalsAlert[] = [];

  // Temperature — normalise to Celsius
  const tempC = vitals.tempC ?? (vitals.tempF ? (vitals.tempF - 32) * 5 / 9 : null);

  if (vitals.hr !== undefined) {
    if (vitals.hr >= THRESHOLDS.hr.critical) {
      alerts.push({ type: "tachycardia", severity: "critical", value: vitals.hr, unit: "bpm", message: `Critical tachycardia: HR ${vitals.hr} bpm` });
    } else if (vitals.hr > THRESHOLDS.hr.high) {
      alerts.push({ type: "tachycardia", severity: "high", value: vitals.hr, unit: "bpm", message: `Tachycardia: HR ${vitals.hr} bpm` });
    } else if (vitals.hr < THRESHOLDS.hr.low) {
      alerts.push({ type: "bradycardia", severity: "medium", value: vitals.hr, unit: "bpm", message: `Bradycardia: HR ${vitals.hr} bpm` });
    }
  }

  if (tempC !== null) {
    if (tempC >= THRESHOLDS.tempC.critical) {
      alerts.push({ type: "fever", severity: "critical", value: tempC, unit: "°C", message: `High fever: ${tempC.toFixed(1)}°C` });
    } else if (tempC > THRESHOLDS.tempC.high) {
      alerts.push({ type: "fever", severity: "medium", value: tempC, unit: "°C", message: `Fever: ${tempC.toFixed(1)}°C` });
    }
  }

  if (vitals.spo2 !== undefined) {
    // FIX: SpO2 of 0 (sensor dropout / disconnection / artifact) was being evaluated
    // as clinical hypoxia and returning a "critical" alert indistinguishable from real
    // hypoxia. SpO2 > 100 is physiologically impossible and also indicates sensor failure.
    // Sensor errors are now classified separately so responders understand the distinction.
    if (vitals.spo2 <= 0 || vitals.spo2 > 100) {
      alerts.push({
        type:     "sensor_error",
        severity: "high",
        value:    vitals.spo2,
        unit:     "%",
        message:  `Invalid SpO2 reading: ${vitals.spo2}% — sensor dropout, disconnection, or artifact suspected`,
      });
    } else if (vitals.spo2 < THRESHOLDS.spo2.critical) {
      alerts.push({ type: "hypoxia", severity: "critical", value: vitals.spo2, unit: "%", message: `Critical hypoxia: SpO2 ${vitals.spo2}%` });
    } else if (vitals.spo2 < THRESHOLDS.spo2.low) {
      alerts.push({ type: "hypoxia", severity: "high", value: vitals.spo2, unit: "%", message: `Low oxygen: SpO2 ${vitals.spo2}%` });
    }
  }

  if (vitals.systolicBP !== undefined) {
    if (vitals.systolicBP < THRESHOLDS.systolicBP.low) {
      alerts.push({ type: "hypotension", severity: "critical", value: vitals.systolicBP, unit: "mmHg", message: `Hypotension: SBP ${vitals.systolicBP} mmHg` });
    } else if (vitals.systolicBP >= THRESHOLDS.systolicBP.critical) {
      alerts.push({ type: "hypertension", severity: "high", value: vitals.systolicBP, unit: "mmHg", message: `Hypertensive: SBP ${vitals.systolicBP} mmHg` });
    }
  }

  if (vitals.rr !== undefined) {
    if (vitals.rr >= THRESHOLDS.rr.critical) {
      alerts.push({ type: "tachypnea", severity: "critical", value: vitals.rr, unit: "bpm", message: `Critical tachypnea: RR ${vitals.rr}` });
    } else if (vitals.rr > THRESHOLDS.rr.high) {
      alerts.push({ type: "tachypnea", severity: "medium", value: vitals.rr, unit: "bpm", message: `Elevated RR: ${vitals.rr}` });
    }
  }

  return alerts;
}

/** Evaluate vitals and push any critical alerts to WebSocket stream */
export function evaluateAndBroadcast(patientId: string, vitals: VitalSigns): VitalsAlert[] {
  const alerts = evaluateVitals(vitals);
  const critical = alerts.filter((a) => a.severity === "critical");

  if (critical.length > 0) {
    broadcastPatientUpdate({ patientId, alerts: critical, source: "vitals_monitor" });
  }

  return alerts;
}
