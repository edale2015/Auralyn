export interface CaseFailureRecord {
  caseId: string;
  complaint: string;
  failure?: {
    category: string;
    severity: string;
  };
}

export interface PatternResult {
  pattern: string;
  count: number;
  percentage: number;
  severity: string;
}

export function detectPatterns(cases: CaseFailureRecord[]): PatternResult[] {
  const failureCases = cases.filter(c => c.failure);
  if (failureCases.length === 0) return [];

  const patternMap: Record<string, { count: number; severity: string }> = {};

  failureCases.forEach(c => {
    const key = c.failure!.category;
    if (!patternMap[key]) {
      patternMap[key] = { count: 0, severity: c.failure!.severity };
    }
    patternMap[key].count++;
  });

  return Object.entries(patternMap)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      percentage: Math.round((data.count / cases.length) * 1000) / 10,
      severity: data.severity,
    }))
    .sort((a, b) => b.count - a.count);
}

export function detectComplaintPatterns(cases: CaseFailureRecord[]): Record<string, PatternResult[]> {
  const byComplaint: Record<string, CaseFailureRecord[]> = {};
  cases.forEach(c => {
    if (!byComplaint[c.complaint]) byComplaint[c.complaint] = [];
    byComplaint[c.complaint].push(c);
  });

  const result: Record<string, PatternResult[]> = {};
  Object.entries(byComplaint).forEach(([complaint, group]) => {
    const patterns = detectPatterns(group);
    if (patterns.length > 0) result[complaint] = patterns;
  });

  return result;
}
