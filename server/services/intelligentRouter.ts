export type IntelligentRouterPhysician = {
  id: string;
  clinicId: string;
  active: boolean;
  currentLoad: number;
  maxConcurrent: number;
  canReviewHighRisk: boolean;
  specialties: string[];
  intelligenceScore: number;
  tier: "elite" | "strong" | "watch" | "restricted";
};

export type IntelligentRouteInput = {
  clinicId: string;
  complaint: string;
  preferredSpecialty?: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

function specialtyBonus(p: IntelligentRouterPhysician, specialty?: string) {
  if (!specialty) return 0;
  return p.specialties.includes(specialty) ? 15 : 0;
}

function loadPenalty(p: IntelligentRouterPhysician) {
  const utilization = p.currentLoad / Math.max(1, p.maxConcurrent);
  return utilization * 40;
}

function highRiskGate(p: IntelligentRouterPhysician, riskLevel: string) {
  if (riskLevel !== "HIGH") return 0;
  return p.canReviewHighRisk ? 20 : -1000;
}

function tierBonus(tier: IntelligentRouterPhysician["tier"]) {
  if (tier === "elite") return 20;
  if (tier === "strong") return 10;
  if (tier === "watch") return -5;
  return -100;
}

export function intelligentlyRouteCase(physicians: IntelligentRouterPhysician[], input: IntelligentRouteInput) {
  const candidates = physicians.filter(
    (p) => p.clinicId === input.clinicId && p.active && p.currentLoad < p.maxConcurrent && p.tier !== "restricted"
  );

  if (!candidates.length) {
    return { assignedPhysicianId: null, score: null, routingReason: "No eligible physician available" };
  }

  const ranked = candidates
    .map((p) => ({
      physician: p,
      score: Number(
        (p.intelligenceScore + specialtyBonus(p, input.preferredSpecialty) + highRiskGate(p, input.riskLevel) + tierBonus(p.tier) - loadPenalty(p)).toFixed(2)
      ),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    assignedPhysicianId: ranked[0].physician.id,
    score: ranked[0].score,
    routingReason: "Routed by intelligence score with load and risk adjustment",
  };
}

const seededPhysicians: IntelligentRouterPhysician[] = [
  { id: "dr-johnson", clinicId: "clinic_a", active: true, currentLoad: 2, maxConcurrent: 8, canReviewHighRisk: true, specialties: ["ent", "general"], intelligenceScore: 88, tier: "elite" },
  { id: "dr-williams", clinicId: "clinic_a", active: true, currentLoad: 4, maxConcurrent: 8, canReviewHighRisk: true, specialties: ["general", "pediatrics"], intelligenceScore: 82, tier: "strong" },
  { id: "dr-chen", clinicId: "clinic_b", active: true, currentLoad: 5, maxConcurrent: 6, canReviewHighRisk: true, specialties: ["general"], intelligenceScore: 65, tier: "watch" },
  { id: "pa-martinez", clinicId: "clinic_b", active: true, currentLoad: 1, maxConcurrent: 6, canReviewHighRisk: false, specialties: ["general", "dermatology"], intelligenceScore: 78, tier: "strong" },
  { id: "dr-patel", clinicId: "clinic_a", active: true, currentLoad: 6, maxConcurrent: 8, canReviewHighRisk: true, specialties: ["cardiology", "general"], intelligenceScore: 58, tier: "watch" },
  { id: "dr-kim", clinicId: "clinic_b", active: true, currentLoad: 3, maxConcurrent: 8, canReviewHighRisk: true, specialties: ["ent", "general"], intelligenceScore: 85, tier: "elite" },
];

export function getSeededRouting(input: IntelligentRouteInput) {
  return intelligentlyRouteCase(seededPhysicians, input);
}

export function getSeededPhysicians() {
  return seededPhysicians;
}
