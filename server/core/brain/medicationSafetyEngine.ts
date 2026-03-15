import { BrainCaseInput, MedicationSafetyResult, RankedItem } from '../../../shared/brainEngineTypes';

export function runMedicationSafetyEngine(
  input: BrainCaseInput,
  treatments: RankedItem[]
): MedicationSafetyResult {
  const alerts: MedicationSafetyResult['alerts'] = [];
  const meds = new Set((input.meds || []).map((m) => m.toLowerCase()));
  for (const tx of treatments) {
    if (tx.id === 'nitrofurantoin' && input.vitals?.pregnant) {
      alerts.push({
        severity: 'warning',
        medication: tx.id,
        reason: 'Pregnancy requires trimester-specific review.',
        saferAlternative: 'cephalexin'
      });
    }
    if (tx.id === 'oseltamivir' && meds.has('warfarin')) {
      alerts.push({
        severity: 'warning',
        medication: tx.id,
        reason: 'Review interactions and renal dosing.',
        saferAlternative: 'physician review'
      });
    }
  }
  return { alerts, blocked: alerts.some((a) => a.severity === 'block') };
}
