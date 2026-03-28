export type Physician = {
  id:            string;
  name:          string;
  activeCases:   number;
  fatigueScore:  number;  // 0–10; higher = more fatigued
  specialty?:    string;
  available:     boolean;
};

export type AssignmentResult = {
  physician:     Physician;
  compositeLoad: number;
};

const physicianRegistry: Physician[] = [
  { id: "dr-chen",   name: "Dr. Lisa Chen",     activeCases: 4, fatigueScore: 2, specialty: "ENT", available: true },
  { id: "dr-patel",  name: "Dr. Raj Patel",     activeCases: 7, fatigueScore: 5, specialty: "ENT", available: true },
  { id: "dr-rivera", name: "Dr. Maria Rivera",  activeCases: 3, fatigueScore: 1, specialty: "GP",  available: true },
  { id: "dr-kim",    name: "Dr. James Kim",     activeCases: 9, fatigueScore: 7, specialty: "ENT", available: true },
  { id: "dr-okonkwo",name: "Dr. Adaeze Okonkwo",activeCases: 5, fatigueScore: 3, specialty: "GP",  available: false },
];

export function getPhysicians(): Physician[] {
  return [...physicianRegistry];
}

export function pickBestPhysician(
  physicians: Physician[],
  specialty?: string
): AssignmentResult {
  const pool = physicians.filter(p => p.available);
  if (pool.length === 0) throw new Error("No available physicians");

  const filtered = specialty ? pool.filter(p => !p.specialty || p.specialty === specialty) : pool;
  const candidates = filtered.length > 0 ? filtered : pool;

  const ranked = candidates
    .map(p => ({ physician: p, compositeLoad: p.activeCases + p.fatigueScore }))
    .sort((a, b) => a.compositeLoad - b.compositeLoad);

  return ranked[0];
}

export function assignCase(caseId: string, specialty?: string): AssignmentResult & { caseId: string } {
  const result = pickBestPhysician(physicianRegistry, specialty);
  const phys = physicianRegistry.find(p => p.id === result.physician.id);
  if (phys) { phys.activeCases++; phys.fatigueScore = Math.min(10, phys.fatigueScore + 0.2); }
  return { ...result, caseId };
}

export function releaseCase(physicianId: string): void {
  const phys = physicianRegistry.find(p => p.id === physicianId);
  if (phys) { phys.activeCases = Math.max(0, phys.activeCases - 1); }
}

export function getBalancerStats() {
  const all = physicianRegistry;
  return {
    total:          all.length,
    available:      all.filter(p => p.available).length,
    avgActiveCases: all.reduce((s, p) => s + p.activeCases, 0) / all.length,
    avgFatigue:     all.reduce((s, p) => s + p.fatigueScore, 0) / all.length,
    physicians:     all,
  };
}
