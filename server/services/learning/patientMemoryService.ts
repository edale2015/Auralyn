import { query } from "../../db";

export interface PatientHistoryRecord {
  id: number;
  patient_id: string;
  complaint: string | null;
  antibiotics_given: boolean;
  improved_with_antibiotics: boolean | null;
  return_visit: boolean;
  timestamp: Date;
}

export async function getPatientHistory(patientId: string): Promise<PatientHistoryRecord[]> {
  try {
    const result = await query(
      `SELECT * FROM patient_history WHERE patient_id = $1 ORDER BY timestamp DESC LIMIT 20`,
      [patientId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function recordPatientVisit(record: {
  patientId: string;
  complaint: string;
  antibioticsGiven: boolean;
  improvedWithAntibiotics?: boolean;
  returnVisit?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO patient_history
       (patient_id, complaint, antibiotics_given, improved_with_antibiotics, return_visit)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      record.patientId,
      record.complaint,
      record.antibioticsGiven,
      record.improvedWithAntibiotics ?? null,
      record.returnVisit ?? false,
    ]
  );
}

export interface PatientPatterns {
  antibioticResponseRate: number;
  frequentReturner: boolean;
  visitCount: number;
}

export function extractPatientPatterns(history: PatientHistoryRecord[]): PatientPatterns {
  const visits = history.length;

  if (visits === 0) {
    return { antibioticResponseRate: 0, frequentReturner: false, visitCount: 0 };
  }

  const improvedWithAbx = history.filter((h) => h.improved_with_antibiotics === true).length;
  const antibioticResponseRate = improvedWithAbx / visits;

  return {
    antibioticResponseRate,
    frequentReturner: visits >= 3,
    visitCount: visits,
  };
}
