export interface ClinicProfile {
  id: string;
  name: string;
  type: "urgent_care" | "primary_care" | "pediatric" | "telehealth" | "specialist" | "er";
  preferences: {
    triageAggression: "conservative" | "moderate" | "aggressive";
    erReferralThreshold: number;
    autoSubmitEnabled: boolean;
  };
  weights: Record<string, number>;
  stats: { totalCases: number; correctDiagnoses: number; overrides: number };
  createdAt: string;
}

const clinicProfiles: Record<string, ClinicProfile> = {};

export function registerClinic(profile: Omit<ClinicProfile, "weights" | "stats" | "createdAt">): ClinicProfile {
  const full: ClinicProfile = {
    ...profile,
    weights: {},
    stats: { totalCases: 0, correctDiagnoses: 0, overrides: 0 },
    createdAt: new Date().toISOString(),
  };
  clinicProfiles[profile.id] = full;
  return full;
}

export function updateClinicLearning(
  clinicId: string,
  outcome: { diagnosis: string; correct: boolean; physicianOverride?: string },
): boolean {
  const profile = clinicProfiles[clinicId];
  if (!profile) return false;

  profile.stats.totalCases++;

  if (!profile.weights[outcome.diagnosis]) {
    profile.weights[outcome.diagnosis] = 0;
  }

  if (outcome.correct) {
    profile.weights[outcome.diagnosis] += 1;
    profile.stats.correctDiagnoses++;
  } else {
    profile.weights[outcome.diagnosis] -= 1;
    if (outcome.physicianOverride) {
      profile.stats.overrides++;
      if (!profile.weights[outcome.physicianOverride]) {
        profile.weights[outcome.physicianOverride] = 0;
      }
      profile.weights[outcome.physicianOverride] += 2;
    }
  }

  return true;
}

export function adjustDiagnosisForClinic(
  clinicId: string,
  diagnoses: Array<{ name: string; score: number }>,
): Array<{ name: string; score: number; clinicBoost: number }> {
  const profile = clinicProfiles[clinicId];
  if (!profile) return diagnoses.map((d) => ({ ...d, clinicBoost: 0 }));

  return diagnoses
    .map((d) => {
      const boost = (profile.weights[d.name] || 0) * 0.05;
      return { ...d, score: d.score + boost, clinicBoost: boost };
    })
    .sort((a, b) => b.score - a.score);
}

export function getClinicProfile(clinicId: string): ClinicProfile | undefined {
  return clinicProfiles[clinicId];
}

export function listClinics(): ClinicProfile[] {
  return Object.values(clinicProfiles);
}

export function getClinicAccuracy(clinicId: string): { accuracy: number; totalCases: number; overrideRate: number } | undefined {
  const profile = clinicProfiles[clinicId];
  if (!profile || profile.stats.totalCases === 0) return undefined;
  return {
    accuracy: Math.round((profile.stats.correctDiagnoses / profile.stats.totalCases) * 100),
    totalCases: profile.stats.totalCases,
    overrideRate: Math.round((profile.stats.overrides / profile.stats.totalCases) * 100),
  };
}
