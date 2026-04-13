/**
 * Deployment Prioritization Engine
 * Ranks expansion clinics by volume, ROI potential, and operational readiness.
 * Used for NYC urgent care pilot rollout sequencing.
 */

export interface ClinicProfile {
  id: string;
  name: string;
  city: string;
  state: string;
  dailyPatientVolume: number;
  currentEHR?: string;
  hasQRKioskCapability?: boolean;
  physicianCount?: number;
  estimatedMonthlyRevenue?: number;
}

export interface DeploymentPlan {
  clinic: ClinicProfile;
  priorityScore: number;
  priorityRank: number;
  estimatedRoiDays?: number;
  deploymentPhase: 1 | 2 | 3;
  blockers: string[];
}

export function prioritizeExpansion(clinics: ClinicProfile[]): DeploymentPlan[] {
  return clinics
    .map(clinic => {
      const volumeScore    = Math.min(1, clinic.dailyPatientVolume / 200) * 0.50;
      const revenueScore   = Math.min(1, (clinic.estimatedMonthlyRevenue ?? 50000) / 200000) * 0.30;
      const readinessScore = (clinic.hasQRKioskCapability ? 0.1 : 0) + (clinic.physicianCount ?? 1 > 2 ? 0.1 : 0);
      const priorityScore  = volumeScore + revenueScore + readinessScore;

      const blockers: string[] = [];
      if (!clinic.currentEHR) blockers.push("No EHR configured");
      if (!clinic.hasQRKioskCapability) blockers.push("No patient intake kiosk");
      if ((clinic.physicianCount ?? 0) < 1) blockers.push("No physicians on record");

      const deploymentPhase: 1 | 2 | 3 =
        priorityScore >= 0.7 ? 1 : priorityScore >= 0.4 ? 2 : 3;

      return { clinic, priorityScore, priorityRank: 0, deploymentPhase, blockers };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((item, i) => ({ ...item, priorityRank: i + 1 }));
}

export function generateDeploymentTimeline(plans: DeploymentPlan[]): {
  phase: number;
  clinics: string[];
  startWeek: number;
  endWeek: number;
}[] {
  const byPhase = [1, 2, 3].map(phase => ({
    phase,
    clinics: plans.filter(p => p.deploymentPhase === phase).map(p => p.clinic.name),
    startWeek: (phase - 1) * 4 + 1,
    endWeek: phase * 4,
  }));
  return byPhase.filter(p => p.clinics.length > 0);
}
