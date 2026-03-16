import { COMPLAINTS } from '../../shared/complaints';

export interface SyntheticCase {
  complaint: string;
  age: number;
  sex: 'M' | 'F' | 'unknown';
  fever: boolean;
  feverTemp: number | null;
  durationDays: number;
  sob: boolean;
  chestPain: boolean;
  headache: boolean;
  nausea: boolean;
  vomiting: boolean;
  diarrhea: boolean;
  cough: boolean;
  soreThroat: boolean;
  confusion: boolean;
  weakness: boolean;
  rash: boolean;
  recentTravel: boolean;
  immunocompromised: boolean;
  pregnant: boolean;
  comorbidities: string[];
  expectedAcuity: 'low' | 'moderate' | 'high' | 'critical';
  syntheticCaseId: string;
  generatedAt: string;
}

const COMORBIDITY_POOL = [
  'hypertension', 'diabetes_t2', 'asthma', 'copd', 'heart_failure',
  'chronic_kidney_disease', 'atrial_fibrillation', 'obesity',
  'immunosuppression', 'cancer_active',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function bool(probability = 0.3): boolean {
  return Math.random() < probability;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class ClinicalSimulationEngine {
  readonly name = 'clinicalSimulationEngine';

  generateCase(complaint?: string): SyntheticCase {
    const complaintId = complaint ?? pick(COMPLAINTS);
    const age = randInt(5, 85);
    const isCritical = bool(0.05);
    const isHigh = bool(0.2);
    const acuity = isCritical ? 'critical' : isHigh ? 'high' : bool(0.4) ? 'moderate' : 'low';

    const numComorbidities = randInt(0, 3);
    const comorbidities: string[] = [];
    const pool = [...COMORBIDITY_POOL];
    for (let i = 0; i < numComorbidities; i++) {
      const idx = randInt(0, pool.length - 1);
      comorbidities.push(pool[idx]);
      pool.splice(idx, 1);
    }

    const hasFever = bool(0.4);

    return {
      complaint: complaintId,
      age,
      sex: pick(['M', 'F', 'unknown']),
      fever: hasFever,
      feverTemp: hasFever ? Math.round((37.5 + Math.random() * 2.5) * 10) / 10 : null,
      durationDays: randInt(0, 14),
      sob: bool(0.25),
      chestPain: bool(0.2),
      headache: bool(0.3),
      nausea: bool(0.3),
      vomiting: bool(0.2),
      diarrhea: bool(0.2),
      cough: bool(0.35),
      soreThroat: bool(0.25),
      confusion: bool(0.05),
      weakness: bool(0.2),
      rash: bool(0.1),
      recentTravel: bool(0.15),
      immunocompromised: bool(0.08),
      pregnant: bool(age >= 15 && age <= 50 ? 0.08 : 0),
      comorbidities,
      expectedAcuity: acuity,
      syntheticCaseId: `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
    };
  }

  generateBatch(n: number, complaint?: string): SyntheticCase[] {
    return Array.from({ length: n }, () => this.generateCase(complaint));
  }

  run(context: any): any {
    const syntheticCase = this.generateCase(context.complaint);
    return {
      ...context,
      simulationCase: syntheticCase,
      simulationGenerated: true,
    };
  }
}

export const clinicalSimulationEngine = new ClinicalSimulationEngine();
