import { logMetric } from "../monitoring/metrics";

export interface NationalBenchmark {
  accuracy:           number;   // 0–1
  responseTimeMs:     number;
  safetyRate:         number;   // 0–1
  firstCallResolution: number;  // 0–1
  physicianAgree:     number;   // physician agreement rate 0–1
  denialRate:         number;   // insurance denial rate 0–1
}

export interface LocalMetrics {
  accuracy?:           number;
  responseTimeMs?:     number;
  safetyRate?:         number;
  firstCallResolution?: number;
  physicianAgree?:     number;
  denialRate?:         number;
}

export interface BenchmarkComparison {
  metric:       string;
  local:        number;
  national:     number;
  delta:        number;
  deltaPercent: number;
  status:       "above" | "at" | "below";
  interpretation: string;
}

export interface BenchmarkReport {
  generatedAt:  string;
  comparisons:  BenchmarkComparison[];
  overallGrade: "A" | "B" | "C" | "D" | "F";
  summary:      string;
}

const NATIONAL_BENCHMARKS: NationalBenchmark = {
  accuracy:            0.75,
  responseTimeMs:      300,
  safetyRate:          0.92,
  firstCallResolution: 0.68,
  physicianAgree:      0.80,
  denialRate:          0.22,
};

const BENCHMARK_LABELS: Record<keyof NationalBenchmark, string> = {
  accuracy:            "Diagnostic Accuracy",
  responseTimeMs:      "Avg Response Time (ms)",
  safetyRate:          "Safety Check Rate",
  firstCallResolution: "First-Call Resolution",
  physicianAgree:      "Physician Agreement",
  denialRate:          "Insurance Denial Rate",
};

// For denial rate, lower is better
const LOWER_IS_BETTER: Set<keyof NationalBenchmark> = new Set(["responseTimeMs", "denialRate"]);

function compare(key: keyof NationalBenchmark, local: number, national: number): BenchmarkComparison {
  const delta        = local - national;
  const deltaPercent = national !== 0 ? (delta / national) * 100 : 0;
  const lowerBetter  = LOWER_IS_BETTER.has(key);
  const better       = lowerBetter ? delta < 0 : delta > 0;
  const equal        = Math.abs(deltaPercent) < 2;
  const status: BenchmarkComparison["status"] = equal ? "at" : (better ? "above" : "below");

  const sign = delta >= 0 ? "+" : "";
  const pct  = deltaPercent.toFixed(1);
  const interpretation = equal
    ? `At national benchmark (${national})`
    : better
      ? `${sign}${pct}% vs national — performing better`
      : `${sign}${pct}% vs national — below benchmark, improvement needed`;

  return {
    metric:   BENCHMARK_LABELS[key],
    local:    Math.round(local * 1000) / 1000,
    national: Math.round(national * 1000) / 1000,
    delta:    Math.round(delta * 1000) / 1000,
    deltaPercent: Math.round(deltaPercent * 10) / 10,
    status,
    interpretation,
  };
}

function gradeFromComparisons(comparisons: BenchmarkComparison[]): BenchmarkReport["overallGrade"] {
  const above = comparisons.filter(c => c.status === "above").length;
  const below = comparisons.filter(c => c.status === "below").length;
  const ratio = above / comparisons.length;
  if (below >= 3)  return "D";
  if (ratio >= 0.8) return "A";
  if (ratio >= 0.6) return "B";
  if (ratio >= 0.4) return "C";
  return "D";
}

export function compareBenchmarks(local: LocalMetrics): BenchmarkReport {
  const keys: Array<keyof NationalBenchmark> = [
    "accuracy", "responseTimeMs", "safetyRate", "firstCallResolution", "physicianAgree", "denialRate",
  ];

  const comparisons: BenchmarkComparison[] = keys
    .filter(k => local[k] !== undefined)
    .map(k => compare(k, local[k] as number, NATIONAL_BENCHMARKS[k]));

  const grade = gradeFromComparisons(comparisons);
  const above = comparisons.filter(c => c.status === "above").length;
  const below = comparisons.filter(c => c.status === "below").length;
  const summary = `${above}/${comparisons.length} metrics above national benchmark. Grade: ${grade}.` +
    (below > 0 ? ` ${below} area(s) require attention.` : " Performing well across all tracked metrics.");

  logMetric("benchmark.grade", ["A","B","C","D","F"].indexOf(grade) + 1, "quality");

  return { generatedAt: new Date().toISOString(), comparisons, overallGrade: grade, summary };
}

export function getNationalBenchmarks(): NationalBenchmark {
  return { ...NATIONAL_BENCHMARKS };
}
