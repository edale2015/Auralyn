import { query } from "../../db";

export interface PopulationStats {
  clinicId: string;
  antibioticSuccessRate: number;
  returnVisitRate: number;
}

const _inMemoryThresholds: Record<string, number> = {};

export async function updatePopulationStats(stats: PopulationStats): Promise<void> {
  const adjustment =
    stats.antibioticSuccessRate < 0.3 ? -0.1 :
    stats.returnVisitRate > 0.2       ?  0.1 :
    0;

  const current = _inMemoryThresholds[stats.clinicId] ?? 0.5;
  const next = Math.max(0.3, Math.min(0.7, current + adjustment));
  _inMemoryThresholds[stats.clinicId] = next;

  try {
    await query(
      `INSERT INTO clinic_population_stats (clinic_id, antibiotic_success_rate, return_visit_rate, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (clinic_id) DO UPDATE
         SET antibiotic_success_rate = $2,
             return_visit_rate       = $3,
             updated_at              = NOW()`,
      [stats.clinicId, stats.antibioticSuccessRate, stats.returnVisitRate]
    );
  } catch {
    // DB unavailable — in-memory cache is source of truth
  }
}

export function getClinicThreshold(clinicId: string): number {
  return _inMemoryThresholds[clinicId] ?? 0.5;
}

export function resetClinicThreshold(clinicId: string, value = 0.5): void {
  _inMemoryThresholds[clinicId] = Math.max(0.3, Math.min(0.7, value));
}

export async function loadClinicThresholdsFromDb(): Promise<void> {
  try {
    const result = await query(
      `SELECT clinic_id, antibiotic_success_rate, return_visit_rate FROM clinic_population_stats`
    );
    for (const row of result.rows) {
      const adjustment =
        row.antibiotic_success_rate < 0.3 ? -0.1 :
        row.return_visit_rate > 0.2        ?  0.1 :
        0;
      _inMemoryThresholds[row.clinic_id] = Math.max(0.3, Math.min(0.7, 0.5 + adjustment));
    }
  } catch {
    // Continue with defaults
  }
}
