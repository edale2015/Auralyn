export interface FederatedUpdate {
  clinicId: string;
  clinicName: string;
  diagnosisCounts: Record<string, number>;
  totalCases: number;
  submittedAt: number;
}

export interface FederatedReport {
  globalDiagnosisCounts: Record<string, number>;
  totalCases: number;
  totalClinics: number;
  topDiagnoses: { diagnosis: string; count: number; percentage: number }[];
  clinicContributions: { clinicId: string; clinicName: string; cases: number; share: number }[];
  timestamp: number;
}

const DEMO_UPDATES: FederatedUpdate[] = [
  {
    clinicId: "clinic_001", clinicName: "Downtown ENT Clinic",
    diagnosisCounts: { URI: 120, Sinusitis: 45, "Strep Pharyngitis": 30, Influenza: 25, "Allergic Rhinitis": 55, Pneumonia: 10, "COVID-19": 8, "Otitis Media": 20 },
    totalCases: 313, submittedAt: Date.now() - 86400000,
  },
  {
    clinicId: "clinic_002", clinicName: "Suburban Family Practice",
    diagnosisCounts: { URI: 95, Sinusitis: 30, "Strep Pharyngitis": 40, Influenza: 35, "Allergic Rhinitis": 25, Pneumonia: 15, "COVID-19": 12, "Otitis Media": 28 },
    totalCases: 280, submittedAt: Date.now() - 43200000,
  },
  {
    clinicId: "clinic_003", clinicName: "Pediatric Urgent Care",
    diagnosisCounts: { URI: 85, Sinusitis: 15, "Strep Pharyngitis": 55, Influenza: 20, "Allergic Rhinitis": 10, Pneumonia: 8, "COVID-19": 5, "Otitis Media": 60 },
    totalCases: 258, submittedAt: Date.now() - 21600000,
  },
  {
    clinicId: "clinic_004", clinicName: "Rural Health Center",
    diagnosisCounts: { URI: 60, Sinusitis: 20, "Strep Pharyngitis": 15, Influenza: 30, "Allergic Rhinitis": 18, Pneumonia: 12, "COVID-19": 10, "Otitis Media": 10 },
    totalCases: 175, submittedAt: Date.now() - 7200000,
  },
];

export class FederatedLearningEngine {
  aggregate(updates?: FederatedUpdate[]): FederatedReport {
    const data = updates?.length ? updates : DEMO_UPDATES;
    const global: Record<string, number> = {};
    let totalCases = 0;

    for (const u of data) {
      totalCases += u.totalCases;
      for (const d in u.diagnosisCounts) {
        global[d] = (global[d] || 0) + u.diagnosisCounts[d];
      }
    }

    const topDiagnoses = Object.entries(global)
      .map(([diagnosis, count]) => ({
        diagnosis,
        count,
        percentage: Number(((count / totalCases) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.count - a.count);

    const clinicContributions = data.map((u) => ({
      clinicId: u.clinicId,
      clinicName: u.clinicName,
      cases: u.totalCases,
      share: Number(((u.totalCases / totalCases) * 100).toFixed(1)),
    }));

    return {
      globalDiagnosisCounts: global,
      totalCases,
      totalClinics: data.length,
      topDiagnoses,
      clinicContributions,
      timestamp: Date.now(),
    };
  }
}

export const federatedLearningEngine = new FederatedLearningEngine();
