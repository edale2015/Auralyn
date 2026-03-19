export interface PhysicianProfile {
  id: string;
  name: string;
  specialty: string;
  currentLoad: number;
  maxLoad: number;
  available: boolean;
}

export interface RoutingDecision {
  assignedPhysicianId: string;
  assignedPhysicianName: string;
  matchedSpecialty: boolean;
  reason: string;
  autoSubmitEligible: boolean;
}

const ICD_SPECIALTY_MAP: Record<string, string> = {
  I: "cardiology",
  J: "pulmonary",
  K: "gastroenterology",
  G: "neurology",
  L: "dermatology",
  M: "orthopedics",
  N: "urology",
  F: "psychiatry",
  H: "ophthalmology",
  S: "orthopedics",
  T: "emergency",
};

const physicianRegistry: PhysicianProfile[] = [
  { id: "phys-001", name: "Dr. General", specialty: "general", currentLoad: 0, maxLoad: 20, available: true },
];

export function registerPhysician(profile: PhysicianProfile): void {
  const existing = physicianRegistry.findIndex((p) => p.id === profile.id);
  if (existing >= 0) {
    physicianRegistry[existing] = profile;
  } else {
    physicianRegistry.push(profile);
  }
}

export function getPhysicianRegistry(): PhysicianProfile[] {
  return [...physicianRegistry];
}

export function detectSpecialty(icd10Code: string): string {
  const prefix = icd10Code.charAt(0);
  return ICD_SPECIALTY_MAP[prefix] || "general";
}

export function routeToPhysician(params: {
  icd10Code: string;
  denialRiskScore: number;
  riskLevel: string;
  confidence?: number;
}): RoutingDecision {
  const neededSpecialty = detectSpecialty(params.icd10Code);

  const available = physicianRegistry.filter((p) => p.available && p.currentLoad < p.maxLoad);

  if (available.length === 0) {
    return {
      assignedPhysicianId: "unassigned",
      assignedPhysicianName: "None Available",
      matchedSpecialty: false,
      reason: "No physicians available — queued for next available",
      autoSubmitEligible: false,
    };
  }

  const specialists = available.filter((p) => p.specialty === neededSpecialty);

  let chosen: PhysicianProfile;
  let matchedSpecialty: boolean;

  if (specialists.length > 0) {
    chosen = specialists.sort((a, b) => a.currentLoad - b.currentLoad)[0];
    matchedSpecialty = true;
  } else {
    chosen = available.sort((a, b) => a.currentLoad - b.currentLoad)[0];
    matchedSpecialty = false;
  }

  chosen.currentLoad++;

  const triageLower = (params.riskLevel || "").toUpperCase();
  const isHighRisk = triageLower === "HIGH" || triageLower === "CRITICAL";

  const autoSubmitEligible =
    !isHighRisk &&
    params.denialRiskScore < 0.15 &&
    (params.confidence ?? 0) >= 0.85;

  const reason = matchedSpecialty
    ? `Matched specialty (${neededSpecialty}) — assigned to ${chosen.name} (load: ${chosen.currentLoad}/${chosen.maxLoad})`
    : `No ${neededSpecialty} specialist available — routed to ${chosen.name} (${chosen.specialty}, load: ${chosen.currentLoad}/${chosen.maxLoad})`;

  return {
    assignedPhysicianId: chosen.id,
    assignedPhysicianName: chosen.name,
    matchedSpecialty,
    reason,
    autoSubmitEligible,
  };
}

export function releasePhysicianLoad(physicianId: string): boolean {
  const physician = physicianRegistry.find((p) => p.id === physicianId);
  if (physician && physician.currentLoad > 0) {
    physician.currentLoad--;
    return true;
  }
  return false;
}
