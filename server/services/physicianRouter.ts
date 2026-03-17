export interface PhysicianProfile {
  id: string;
  clinicId: string;
  name: string;
  role: "physician" | "pa" | "np";
  specialties: string[];
  active: boolean;
  currentLoad: number;
  maxConcurrent: number;
  canReviewHighRisk: boolean;
}

export interface RoutedCaseInput {
  clinicId: string;
  complaint: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  preferredSpecialty?: string;
}

export interface RoutingResult {
  assignedPhysicianId: string | null;
  assignedPhysicianName: string | null;
  routingReason: string;
  score: number;
  candidatesEvaluated: number;
}

function specialtyScore(physician: PhysicianProfile, preferred?: string): number {
  if (!preferred) return 0;
  return physician.specialties.includes(preferred) ? 3 : 0;
}

function highRiskScore(physician: PhysicianProfile, riskLevel: string): number {
  if (riskLevel !== "HIGH") return 0;
  return physician.canReviewHighRisk ? 4 : -100;
}

function loadScore(physician: PhysicianProfile): number {
  return physician.maxConcurrent - physician.currentLoad;
}

export function routeCaseToPhysician(physicians: PhysicianProfile[], input: RoutedCaseInput): RoutingResult {
  let candidates = physicians.filter(
    (p) => p.clinicId === input.clinicId && p.active && p.currentLoad < p.maxConcurrent
  );

  if (input.riskLevel === "HIGH") {
    candidates = candidates.filter((p) => p.canReviewHighRisk);
    if (!candidates.length) {
      return { assignedPhysicianId: null, assignedPhysicianName: null, routingReason: "No high-risk-capable physician available — escalation required", score: 0, candidatesEvaluated: 0 };
    }
  }

  if (!candidates.length) {
    return { assignedPhysicianId: null, assignedPhysicianName: null, routingReason: "No available clinician", score: 0, candidatesEvaluated: 0 };
  }

  const ranked = candidates
    .map((p) => ({
      physician: p,
      score: specialtyScore(p, input.preferredSpecialty) + highRiskScore(p, input.riskLevel) + loadScore(p),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return {
    assignedPhysicianId: best.physician.id,
    assignedPhysicianName: best.physician.name,
    routingReason: `Best match by score ${best.score} (load: ${best.physician.currentLoad}/${best.physician.maxConcurrent})`,
    score: best.score,
    candidatesEvaluated: candidates.length,
  };
}

const demoPhysicians: PhysicianProfile[] = [
  { id: "dr_001", clinicId: "clinic_a", name: "Dr. Sarah Williams", role: "physician", specialties: ["ENT", "otology"], active: true, currentLoad: 3, maxConcurrent: 8, canReviewHighRisk: true },
  { id: "dr_002", clinicId: "clinic_a", name: "Dr. Michael Chen", role: "physician", specialties: ["ENT", "rhinology"], active: true, currentLoad: 5, maxConcurrent: 8, canReviewHighRisk: true },
  { id: "dr_003", clinicId: "clinic_a", name: "PA Jessica Martinez", role: "pa", specialties: ["ENT"], active: true, currentLoad: 2, maxConcurrent: 6, canReviewHighRisk: false },
  { id: "dr_004", clinicId: "clinic_a", name: "NP David Park", role: "np", specialties: ["ENT", "allergy"], active: true, currentLoad: 4, maxConcurrent: 6, canReviewHighRisk: false },
  { id: "dr_005", clinicId: "clinic_b", name: "Dr. Emily Johnson", role: "physician", specialties: ["ENT", "laryngology"], active: true, currentLoad: 1, maxConcurrent: 10, canReviewHighRisk: true },
  { id: "dr_006", clinicId: "clinic_b", name: "Dr. Robert Kim", role: "physician", specialties: ["ENT", "head_neck"], active: false, currentLoad: 0, maxConcurrent: 8, canReviewHighRisk: true },
];

export function getPhysicians(clinicId?: string): PhysicianProfile[] {
  if (clinicId) return demoPhysicians.filter((p) => p.clinicId === clinicId);
  return demoPhysicians;
}

export function assignCaseLoad(physicianId: string): boolean {
  const p = demoPhysicians.find((d) => d.id === physicianId);
  if (p && p.currentLoad < p.maxConcurrent) { p.currentLoad++; return true; }
  return false;
}

export function releaseCaseLoad(physicianId: string): boolean {
  const p = demoPhysicians.find((d) => d.id === physicianId);
  if (p && p.currentLoad > 0) { p.currentLoad--; return true; }
  return false;
}
