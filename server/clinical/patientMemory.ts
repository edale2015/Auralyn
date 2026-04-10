export interface Visit {
  timestamp: string;
  complaint: string;
  disposition: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}

const patientMemory: Record<string, Visit[]> = {};

export function updateMemory(id: string, visit: Omit<Visit, "timestamp"> & { timestamp?: string }): void {
  if (!patientMemory[id]) patientMemory[id] = [];
  patientMemory[id].push({ timestamp: new Date().toISOString(), ...visit });
}

export function getMemory(id: string): Visit[] {
  return patientMemory[id] ?? [];
}

export function clearMemory(id?: string): void {
  if (id) {
    delete patientMemory[id];
  } else {
    Object.keys(patientMemory).forEach(k => delete patientMemory[k]);
  }
}

export function memoryStats(): { totalPatients: number; totalVisits: number } {
  const keys = Object.keys(patientMemory);
  return {
    totalPatients: keys.length,
    totalVisits: keys.reduce((sum, k) => sum + patientMemory[k].length, 0),
  };
}
