export type Slot = {
  slotId:      string;
  time:        string;
  physicianId: string;
  load:        number;   // 0–1 float
  specialty?:  string;
};

export type ScheduleAssignment = {
  caseId:       string;
  assignedTo:   string;
  time:         string;
  slotId:       string;
  loadAtAssign: number;
};

const slotStore: Slot[] = [
  { slotId: "s1", time: "08:00", physicianId: "dr-chen",    load: 0.2, specialty: "ENT" },
  { slotId: "s2", time: "08:30", physicianId: "dr-patel",   load: 0.5, specialty: "ENT" },
  { slotId: "s3", time: "09:00", physicianId: "dr-rivera",  load: 0.3, specialty: "GP"  },
  { slotId: "s4", time: "09:30", physicianId: "dr-kim",     load: 0.4, specialty: "ENT" },
  { slotId: "s5", time: "10:00", physicianId: "dr-chen",    load: 0.6, specialty: "ENT" },
  { slotId: "s6", time: "10:30", physicianId: "dr-patel",   load: 0.2, specialty: "ENT" },
];

export function getSlots(): Slot[] {
  return [...slotStore];
}

export function optimizeSchedule(
  slots: Slot[],
  cases: Array<{ caseId: string; urgency?: "routine" | "urgent" | "emergent"; specialty?: string }>
): ScheduleAssignment[] {
  const pool = slots.map(s => ({ ...s })); // shallow copy to avoid mutating originals

  return cases.map(c => {
    const candidates = c.specialty
      ? pool.filter(s => !s.specialty || s.specialty === c.specialty)
      : pool;

    const available = candidates.length > 0 ? candidates : pool;
    available.sort((a, b) => a.load - b.load);
    const best = available[0];

    const loadAtAssign = best.load;
    best.load = Math.min(1, best.load + 0.1);

    return {
      caseId:       c.caseId,
      assignedTo:   best.physicianId,
      time:         best.time,
      slotId:       best.slotId,
      loadAtAssign: Math.round(loadAtAssign * 100) / 100,
    };
  });
}

export function scheduleSingleCase(caseItem: { caseId: string; urgency?: string; specialty?: string }): ScheduleAssignment {
  const result = optimizeSchedule(slotStore, [caseItem as any]);
  return result[0];
}
