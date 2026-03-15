export interface CaseInput {
  caseId: string;
  complaint: string;
  symptoms: string[];
  answers?: Record<string, unknown>;
  vitals?: Record<string, number>;
}

export interface Differential {
  diagnosis: string;
  score: number;
}

export interface BrainResult {
  differential: Differential[];
  confidence: 'high' | 'moderate' | 'low';
  disposition: string;
}
