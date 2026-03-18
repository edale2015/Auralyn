export type WarehouseFactCase = {
  caseId: string;
  clinicId: string;
  physicianId: string;
  complaint: string;
  riskLevel: string;
  confidence: number;
  escalated: boolean;
  override: boolean;
  reviewSeconds: number;
  satisfaction: number;
  createdAt: string;
};

export type WarehouseExportBundle = {
  facts_cases: WarehouseFactCase[];
  dim_clinics: { clinicId: string; clinicName: string }[];
  dim_physicians: { physicianId: string; clinicId: string; physicianName: string }[];
};

export function buildWarehouseExport(): WarehouseExportBundle {
  return {
    facts_cases: [
      { caseId: "case-1001", clinicId: "clinicA", physicianId: "dr-johnson", complaint: "cough", riskLevel: "LOW", confidence: 0.91, escalated: false, override: false, reviewSeconds: 10, satisfaction: 4.8, createdAt: "2026-03-18T08:00:00Z" },
      { caseId: "case-1002", clinicId: "clinicA", physicianId: "dr-smith", complaint: "dizziness", riskLevel: "HIGH", confidence: 0.61, escalated: true, override: true, reviewSeconds: 35, satisfaction: 3.9, createdAt: "2026-03-18T08:10:00Z" },
      { caseId: "case-1003", clinicId: "clinicB", physicianId: "dr-patel", complaint: "rash", riskLevel: "LOW", confidence: 0.95, escalated: false, override: false, reviewSeconds: 8, satisfaction: 4.9, createdAt: "2026-03-18T09:00:00Z" },
      { caseId: "case-1004", clinicId: "clinicA", physicianId: "dr-lee", complaint: "headache", riskLevel: "MODERATE", confidence: 0.78, escalated: false, override: false, reviewSeconds: 18, satisfaction: 4.5, createdAt: "2026-03-18T09:15:00Z" },
      { caseId: "case-1005", clinicId: "clinicB", physicianId: "dr-kim", complaint: "chest_pain", riskLevel: "HIGH", confidence: 0.65, escalated: true, override: true, reviewSeconds: 28, satisfaction: 4.1, createdAt: "2026-03-18T10:00:00Z" },
    ],
    dim_clinics: [
      { clinicId: "clinicA", clinicName: "Clinic A — Main Campus" },
      { clinicId: "clinicB", clinicName: "Clinic B — Satellite" },
      { clinicId: "clinicC", clinicName: "Clinic C — Virtual" },
      { clinicId: "clinicD", clinicName: "Clinic D — Pediatrics" },
    ],
    dim_physicians: [
      { physicianId: "dr-johnson", clinicId: "clinicA", physicianName: "Dr. Johnson" },
      { physicianId: "dr-smith", clinicId: "clinicA", physicianName: "Dr. Smith" },
      { physicianId: "dr-lee", clinicId: "clinicA", physicianName: "Dr. Lee" },
      { physicianId: "dr-patel", clinicId: "clinicB", physicianName: "Dr. Patel" },
      { physicianId: "dr-kim", clinicId: "clinicB", physicianName: "Dr. Kim" },
    ],
  };
}
