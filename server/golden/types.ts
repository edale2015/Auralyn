export interface GoldenCaseResult {
  caseId: string;
  passed: boolean;
  score: number;
  expected: {
    diagnosis: string;
    disposition: string;
    redFlags: string[];
  };
  actual: {
    diagnosis?: string;
    disposition?: string;
    redFlags?: string[];
  };
  failReasons: string[];
}

export interface GoldenCaseBatchResult {
  runBatch: string;
  systemVersion: string;
  engineVersion: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: GoldenCaseResult[];
  durationMs: number;
}

export interface CoverageGap {
  complaint: string;
  riskBand: string;
  ageBand: string;
  current: number;
  target: number;
  gap: number;
}
