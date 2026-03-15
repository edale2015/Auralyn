import type { SuperBrainInput } from '../core/clinicalSuperBrain';

const symptomPool = [
  'fever', 'cough', 'dysuria', 'chest_pain', 'shortness_of_breath',
  'headache', 'ear_pain', 'sore_throat', 'diaphoresis', 'stiff_neck',
  'urinary_frequency', 'pleuritic_pain', 'hemoptysis',
];

const complaintPool = [
  'chest pain', 'cough', 'ear pain', 'sore throat', 'difficulty urinating',
  'headache', 'shortness of breath',
];

export function scenarioGenerator(count = 1000): SuperBrainInput[] {
  const cases: SuperBrainInput[] = [];
  for (let i = 0; i < count; i++) {
    const numSymptoms = Math.floor(Math.random() * 3) + 1;
    const symptoms: string[] = [];
    for (let j = 0; j < numSymptoms; j++) {
      const s = symptomPool[Math.floor(Math.random() * symptomPool.length)];
      if (!symptoms.includes(s)) symptoms.push(s);
    }
    cases.push({
      caseId: `sim_${i}`,
      complaint: complaintPool[Math.floor(Math.random() * complaintPool.length)],
      symptoms,
    });
  }
  return cases;
}
