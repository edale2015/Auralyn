/**
 * Live Patient Engine — continuous 2-second patient stream
 * Generates vitals, runs NEWS2 deterioration + intervention engine,
 * priority-ranks patients, and broadcasts to all WS clients.
 */

// Phase 1 Fix: import both tenant-scoped and system-level broadcast.
// broadcastPatientUpdate(data, clinicId) sends only to clients in that clinic.
// broadcastSystemUpdate(data) sends to all clients (used when no clinicId is set).
import { broadcastPatientUpdate, broadcastSystemUpdate } from "./patientStream";
import { generateInterventions, VitalSnapshot } from "../engines/interventionEngine";

export interface LivePatient {
  id:            number;
  name:          string;
  age:           number;
  condition:     string;
  vitals:        VitalSnapshot & { tempF: number };
  status:        "stable" | "warning" | "critical";
  deterioration: {
    newsScore:      number;
    riskLevel:      string;
    sepsisCriteria: boolean;
    prediction:     string;
  };
  interventions: ReturnType<typeof generateInterventions>["interventions"];
  priorityScore: number;
  lastUpdated:   string;
}

// Seeded patient profiles — vitals drift realistically over time
const PATIENT_PROFILES = [
  { id: 1, name: "Maria Rivera",   age: 68, condition: "chest pain",         baseHR: 108, baseSPO2: 92, baseTemp: 101.2, baseSBP: 88  },
  { id: 2, name: "James Lee",      age: 45, condition: "fever + chills",      baseHR:  96, baseSPO2: 97, baseTemp: 102.8, baseSBP: 118 },
  { id: 3, name: "Sarah Cohen",    age: 33, condition: "shortness of breath", baseHR: 124, baseSPO2: 89, baseTemp:  98.6, baseSBP: 102 },
  { id: 4, name: "Robert Kim",     age: 72, condition: "altered mental status",baseHR:  88, baseSPO2: 94, baseTemp: 99.1,  baseSBP: 96  },
  { id: 5, name: "Elena Torres",   age: 55, condition: "abdominal pain",      baseHR:  82, baseSPO2: 98, baseTemp:  99.4, baseSBP: 130 },
];

// State: each patient's current vitals (will drift over time)
let state: Record<number, VitalSnapshot & { tempF: number }> = {};
for (const p of PATIENT_PROFILES) {
  state[p.id] = { hr: p.baseHR, spo2: p.baseSPO2, temp: p.baseTemp, systolicBP: p.baseSBP, tempF: p.baseTemp };
}

let currentPatients: LivePatient[] = [];
let tickCount = 0;
let engineTimer: ReturnType<typeof setInterval> | null = null;

function drift(value: number, min: number, max: number, volatility: number): number {
  const delta = (Math.random() - 0.5) * volatility;
  return Math.min(max, Math.max(min, Math.round((value + delta) * 10) / 10));
}

function formatBP(systolic: number): string {
  return `${systolic}/${Math.round(systolic * 0.65)}`;
}

function patientStatus(riskLevel: string): LivePatient["status"] {
  if (riskLevel === "critical" || riskLevel === "high") return "critical";
  if (riskLevel === "medium") return "warning";
  return "stable";
}

function tick(): void {
  tickCount++;

  const patients: LivePatient[] = PATIENT_PROFILES.map((profile) => {
    const prev = state[profile.id];

    // Drift vitals over time (±small random walk, bounded to physiologic range)
    const vitals: VitalSnapshot & { tempF: number } = {
      hr:         drift(prev.hr,         40,  200, 4),
      spo2:       drift(prev.spo2,       80,  100, 1),
      temp:       drift(prev.temp,       95.0, 106.0, 0.3),
      systolicBP: drift(prev.systolicBP, 60,  200, 6),
      tempF:      drift(prev.temp,       95.0, 106.0, 0.3),
    };
    vitals.tempF = vitals.temp;  // alias

    state[profile.id] = vitals;

    const result    = generateInterventions(vitals);
    const priority  = result.newsScore * 2 + (result.riskLevel === "critical" ? 10 : result.riskLevel === "high" ? 5 : 0);

    return {
      id:          profile.id,
      name:        profile.name,
      age:         profile.age,
      condition:   profile.condition,
      vitals:      { ...vitals, bp: formatBP(vitals.systolicBP) } as any,
      status:      patientStatus(result.riskLevel),
      deterioration: {
        newsScore:     result.newsScore,
        riskLevel:     result.riskLevel,
        sepsisCriteria:result.sepsisCriteria,
        prediction:    result.prediction,
      },
      interventions: result.interventions,
      priorityScore: priority,
      lastUpdated:   new Date().toISOString(),
    };
  });

  // Sort by priority descending (sickest first)
  patients.sort((a, b) => b.priorityScore - a.priorityScore);
  currentPatients = patients;

  const payload = {
    type:     "PATIENT_UPDATE",
    patients: patients.map((p) => ({
      id:            p.id,
      name:          p.name,
      age:           p.age,
      condition:     p.condition,
      vitals:        p.vitals,
      status:        p.status,
      deterioration: p.deterioration,
      interventions: p.interventions.slice(0, 3),   // top 3
      priorityScore: p.priorityScore,
      lastUpdated:   p.lastUpdated,
    })),
    tick:         tickCount,
    criticalCount: patients.filter((p) => p.status === "critical").length,
  };

  // Phase 1 Fix: use tenant-scoped broadcast when clinicId is configured.
  // Prevents one clinic's live patient data from leaking to another clinic's WS clients.
  if (engineClinicId) {
    broadcastPatientUpdate(payload, engineClinicId);
  } else {
    // Fallback: broadcast to all (dev mode / single-tenant deployment)
    broadcastSystemUpdate(payload);
  }
}

// clinicId for tenant-scoped broadcasting — set via startLivePatientEngine(clinicId)
let engineClinicId: string | null = null;

export function startLivePatientEngine(clinicId?: string): void {
  if (engineTimer) return;

  if (clinicId) {
    engineClinicId = clinicId;
    console.log(`[LivePatientEngine] Started for clinic ${clinicId} — tenant-scoped broadcast`);
  } else {
    console.log("[LivePatientEngine] Started in system-wide broadcast mode (no clinicId — all clients receive updates)");
  }

  tick(); // immediate first tick
  engineTimer = setInterval(tick, 2000);
}

export function stopLivePatientEngine(): void {
  if (engineTimer) { clearInterval(engineTimer); engineTimer = null; }
}

export function getCurrentPatients(): LivePatient[] {
  return currentPatients;
}

export function getEngineStats() {
  return {
    ticks:          tickCount,
    patients:       currentPatients.length,
    criticalCount:  currentPatients.filter((p) => p.status === "critical").length,
    running:        engineTimer !== null,
  };
}
