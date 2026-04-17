/**
 * server/simulation/icuSimulator.ts
 * ICU Digital Twin Simulator — streams synthetic vitals through the deterioration
 * engine and broadcasts via WebSocket for real-time wall/dashboard display.
 *
 * Uses the actual broadcastPatientUpdate from patientStream.ts when available,
 * falling back gracefully to a no-op if WebSocket is not yet initialised.
 */

import { computeDeteriorationRisk, type StreamVitals } from "../prediction/deteriorationEngine";

// ── Broadcast shim — lazy-require to avoid circular imports ──────────────────

let _broadcast: ((data: any) => void) | null = null;

export function setICUBroadcaster(fn: (data: any) => void) {
  _broadcast = fn;
}

function broadcast(data: any) {
  _broadcast?.(data);
}

// ── Vitals generators ─────────────────────────────────────────────────────────

function randomBetween(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

function generateNormalVitals(): StreamVitals {
  return {
    hr:   Math.round(randomBetween(60,  90)),
    bp:   Math.round(randomBetween(110, 140)),
    spo2: Math.round(randomBetween(96,  100)),
    temp: parseFloat(randomBetween(36.5, 37.5).toFixed(1)),
    rr:   Math.round(randomBetween(12, 18)),
  };
}

function generateDeterioratingVitals(): StreamVitals {
  return {
    hr:   Math.round(randomBetween(100, 145)),
    bp:   Math.round(randomBetween(70,  95)),
    spo2: Math.round(randomBetween(87,  93)),
    temp: parseFloat(randomBetween(38.5, 40.0).toFixed(1)),
    rr:   Math.round(randomBetween(22,  32)),
  };
}

// ── Patient pool ──────────────────────────────────────────────────────────────

const ICU_SIZE = 20;

type SimPatient = {
  id:         string;
  bed:        string;
  name:       string;
  diagnosis:  string;
  criticalPct: number;   // probability of generating deteriorating vitals
};

function makeCohort(): SimPatient[] {
  const dxPool = ["Post-op monitoring", "CHF exacerbation", "Pneumonia", "Sepsis watch",
                  "ACS — stable", "PE — on anticoag", "DKA", "Stroke — acute",
                  "GI bleed", "Hepatic encephalopathy"];
  return Array.from({ length: ICU_SIZE }, (_, i) => ({
    id:          `ICU_${String(i + 1).padStart(2, "0")}`,
    bed:         `ICU-${i + 1}`,
    name:        `Patient ${i + 1}`,
    diagnosis:   dxPool[i % dxPool.length],
    criticalPct: i < 4 ? 0.55 : 0.10,  // first 4 beds = "high risk" patients
  }));
}

let cohort: SimPatient[] = makeCohort();
let _interval: ReturnType<typeof setInterval> | null = null;

// ── Simulator ─────────────────────────────────────────────────────────────────

export function startICUSimulator(intervalMs = 1500): void {
  if (_interval) return;   // already running

  cohort = makeCohort();

  _interval = setInterval(() => {
    for (const p of cohort) {
      const isDeteriorating = Math.random() < p.criticalPct;
      const vitals = isDeteriorating
        ? generateDeterioratingVitals()
        : generateNormalVitals();

      const risk = computeDeteriorationRisk(vitals);

      const payload = {
        id:         p.id,
        bed:        p.bed,
        name:       p.name,
        diagnosis:  p.diagnosis,
        vitals,
        risk,
        alert:      risk.alert,
        timestamp:  Date.now(),
      };

      broadcast(payload);
    }
  }, intervalMs);

  console.log(`[ICUSimulator] Started — ${ICU_SIZE} simulated patients, interval ${intervalMs}ms`);
}

export function stopICUSimulator(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    console.log("[ICUSimulator] Stopped");
  }
}

export function detectDeterioration(vitals: StreamVitals) {
  const r = computeDeteriorationRisk(vitals);
  return r.deteriorating;
}

export function isRunning() {
  return _interval !== null;
}
