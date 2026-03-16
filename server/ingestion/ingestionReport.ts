export interface IngestionResult {
  status: "success" | "blocked" | "error";
  reason?: string;
  validatedFile?: string;
  counts?: {
    complaints: number;
    questions: number;
    dispositions: number;
    redFlags: number;
    clusterScoring: number;
    templates: number;
  };
  validationSummary?: any;
  timestamp: string;
}

export function buildIngestionReport(
  status: IngestionResult["status"],
  counts?: IngestionResult["counts"],
  extra?: Partial<IngestionResult>
): IngestionResult {
  return {
    status,
    counts,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}
