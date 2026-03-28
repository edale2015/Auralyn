const scheduleMap: Record<string, "II" | "III" | "IV" | "V"> = {
  // Schedule II — high abuse potential
  oxycodone:    "II",
  hydrocodone:  "II",
  fentanyl:     "II",
  morphine:     "II",
  methadone:    "II",
  adderall:     "II",
  ritalin:      "II",
  methylphenidate: "II",
  amphetamine:  "II",
  // Schedule III
  buprenorphine: "III",
  ketamine:     "III",
  testosterone: "III",
  anabolic:     "III",
  // Schedule IV
  alprazolam:   "IV",
  diazepam:     "IV",
  lorazepam:    "IV",
  clonazepam:   "IV",
  zolpidem:     "IV",
  tramadol:     "IV",
  carisoprodol: "IV",
  // Schedule V
  pregabalin:   "V",
  gabapentin:   "V",
  codeine:      "V",
};

export interface DeaCheckResult {
  allowed: boolean;
  schedule: "II" | "III" | "IV" | "V" | null;
  reason?: string;
  requiresSpecialForm?: boolean;
}

export function getControlledSchedule(drug: string): "II" | "III" | "IV" | "V" | null {
  const key = drug.toLowerCase().trim();
  for (const [name, schedule] of Object.entries(scheduleMap)) {
    if (key.includes(name)) return schedule;
  }
  return null;
}

export function validatePrescriptionAuthority(input: {
  clinicianHasDea: boolean;
  state: string;
  drug: string;
  patientAge?: number;
}): DeaCheckResult {
  const schedule = getControlledSchedule(input.drug);

  if (!schedule) {
    return { allowed: true, schedule: null };
  }

  if (!input.clinicianHasDea) {
    return {
      allowed: false,
      schedule,
      reason: `DEA registration required for Schedule ${schedule} controlled substance`,
    };
  }

  // Schedule II requires special handling
  if (schedule === "II") {
    return {
      allowed: true,
      schedule,
      requiresSpecialForm: true,
      reason: `Schedule II — electronic prescribing (EPCS) or paper DEA Form 222 required`,
    };
  }

  // Pediatric safety check
  if (input.patientAge !== undefined && input.patientAge < 18 && schedule === "II") {
    return {
      allowed: false,
      schedule,
      reason: "Schedule II controlled substances require additional pediatric safety review",
    };
  }

  return { allowed: true, schedule };
}

export function getScheduleDb(): Record<string, string> {
  return { ...scheduleMap };
}
