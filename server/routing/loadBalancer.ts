import { auditLog } from "../security/auditLogger";

export interface Physician {
  id: string;
  name: string;
  skills: string[];
  activeCases: number;
  maxCapacity: number;
  avgResponseTimeMs: number;
  performanceScore: number;
  specialty?: string;
  online: boolean;
}

export interface RoutingCase {
  caseId: string;
  complaint: string;
  riskScore: number;
}

export interface RoutingResult {
  physician: Physician;
  score: number;
  reason: string;
  loadFactor: number;
}

const physicians = new Map<string, Physician>();

const COMPLAINT_SKILL_MAP: Record<string, string[]> = {
  sore_throat: ["ent", "general"],
  ear_pain: ["ent", "general"],
  rash: ["derm", "general"],
  flu_like: ["general", "infectious"],
  chest_pain: ["cardio", "general"],
  cough: ["pulm", "general"],
  fever: ["general", "infectious"],
  ear_infection: ["ent", "general"],
  sinusitis: ["ent", "general"],
};

export function registerPhysician(p: Physician): Physician {
  physicians.set(p.id, p);
  auditLog({ actor: "load_balancer", action: "physician_registered", details: { id: p.id, skills: p.skills, maxCapacity: p.maxCapacity } });
  return p;
}

export function updatePhysicianLoad(id: string, delta: number): void {
  const p = physicians.get(id);
  if (!p) return;
  p.activeCases = Math.max(0, p.activeCases + delta);
}

export function updatePhysicianPerformance(id: string, responseTimeMs: number, success: boolean): void {
  const p = physicians.get(id);
  if (!p) return;
  p.avgResponseTimeMs = Math.round(p.avgResponseTimeMs * 0.8 + responseTimeMs * 0.2);
  p.performanceScore = Math.max(0, Math.min(1, p.performanceScore + (success ? 0.02 : -0.05)));
}

export function selectPhysician(c: RoutingCase): RoutingResult | null {
  const requiredSkills = COMPLAINT_SKILL_MAP[c.complaint] ?? ["general"];

  const candidates = [...physicians.values()].filter(
    (p) =>
      p.online &&
      p.activeCases < p.maxCapacity &&
      p.skills.some((s) => requiredSkills.includes(s))
  );

  if (!candidates.length) {
    const fallback = [...physicians.values()].find((p) => p.online && p.activeCases < p.maxCapacity);
    if (!fallback) return null;
    candidates.push(fallback);
  }

  const riskWeight = c.riskScore >= 0.7 ? 1.5 : c.riskScore >= 0.4 ? 1.2 : 1.0;

  const scored = candidates.map((p) => {
    const loadFactor = p.activeCases / p.maxCapacity;
    const skillMatch = p.skills.some((s) => requiredSkills.includes(s)) ? 1 : 0.5;
    const score =
      (p.performanceScore * 0.45 +
        (1 - loadFactor) * 0.35 +
        (1 / (p.avgResponseTimeMs / 1000 + 1)) * 0.2) *
      riskWeight *
      skillMatch;

    return { physician: p, score, loadFactor };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  auditLog({
    actor: "load_balancer",
    action: "physician_selected",
    details: {
      caseId: c.caseId,
      physicianId: best.physician.id,
      score: best.score.toFixed(3),
      loadFactor: best.loadFactor.toFixed(2),
      riskScore: c.riskScore,
      complaint: c.complaint,
    },
  });

  return {
    physician: best.physician,
    score: best.score,
    reason: `score=${best.score.toFixed(3)} load=${(best.loadFactor * 100).toFixed(0)}% perf=${best.physician.performanceScore.toFixed(2)}`,
    loadFactor: best.loadFactor,
  };
}

export function getAllPhysicians(): Physician[] {
  return [...physicians.values()];
}

export function getPhysician(id: string): Physician | undefined {
  return physicians.get(id);
}

export function removePhysician(id: string): boolean {
  return physicians.delete(id);
}

export function getLoadBalancerStats() {
  const all = [...physicians.values()];
  const online = all.filter((p) => p.online);
  const totalActive = all.reduce((s, p) => s + p.activeCases, 0);
  const totalCapacity = all.reduce((s, p) => s + p.maxCapacity, 0);
  return {
    total: all.length,
    online: online.length,
    totalActiveCases: totalActive,
    totalCapacity,
    utilizationRate: totalCapacity > 0 ? totalActive / totalCapacity : 0,
    avgPerformance: all.length > 0 ? all.reduce((s, p) => s + p.performanceScore, 0) / all.length : 0,
  };
}

function seedDemoPhysicians(): void {
  const demos: Physician[] = [
    { id: "dr-001", name: "Dr. Chen", skills: ["ent", "general"], activeCases: 3, maxCapacity: 10, avgResponseTimeMs: 800, performanceScore: 0.88, specialty: "ENT", online: true },
    { id: "dr-002", name: "Dr. Patel", skills: ["general", "infectious"], activeCases: 5, maxCapacity: 12, avgResponseTimeMs: 650, performanceScore: 0.92, specialty: "Internal Medicine", online: true },
    { id: "dr-003", name: "Dr. Rivera", skills: ["derm", "general"], activeCases: 2, maxCapacity: 8, avgResponseTimeMs: 1200, performanceScore: 0.79, specialty: "Dermatology", online: true },
    { id: "dr-004", name: "Dr. Kim", skills: ["cardio", "general"], activeCases: 7, maxCapacity: 8, avgResponseTimeMs: 500, performanceScore: 0.95, specialty: "Cardiology", online: false },
  ];
  for (const d of demos) registerPhysician(d);
}

seedDemoPhysicians();
