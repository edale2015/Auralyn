/**
 * benchmarkTracker.ts — Standardized skill benchmark across versions
 *
 * Article 29 (Skill Evals — Benchmark mode):
 *   "Benchmark runs your evals as a standardized assessment. Run it after model
 *    updates, after editing the skill, or before shipping a new version. It tracks
 *    pass rate, elapsed time and token usage so you can compare versions over time."
 *
 * "No CI/CD integration out of the box: We can wire eval results into a CI system
 *  ourselves, but there's no GitHub Action or built-in hook."
 *  → benchmarkTracker.ts provides the data layer for CI integration.
 *
 * "No cross-model testing: If a skill needs to work on both Sonnet and Opus,
 *  we run separate benchmarks manually."
 *  → Each benchmark run records the model name for cross-model comparison.
 *
 * Clinical translation:
 *   Every time a new model drops (GPT-5, Claude 5, etc.) or the sepsis protocol
 *   is updated, run benchmark. If pass rate drops, regression monitor fires.
 *   If pass rate is identical with and without skill, the skill may be obsolete.
 */

import { runEvalSuite, type EvalCase, type EvalSuiteResult } from "./evalEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkRun {
  id:           string;
  skillName:    string;
  skillVersion: string;
  modelName:    string;
  passRate:     number;
  avgScore:     number;
  avgScoreBaseline: number;
  totalTokens:  number;
  elapsedMs:    number;
  suite:        EvalSuiteResult;
  ranAt:        Date;
}

export interface BenchmarkComparison {
  skillName:     string;
  runs:          BenchmarkRun[];
  trend:         "improving" | "stable" | "degrading" | "insufficient_data";
  latestRate:    number;
  baseline:      number;    // first run's pass rate
  delta:         number;    // latest - baseline
  recommendation: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _benchmarks = new Map<string, BenchmarkRun[]>();
let _seq = 1;

// ── runBenchmark ──────────────────────────────────────────────────────────────

export async function runBenchmark(
  skillName:    string,
  cases:        EvalCase[],
  skillVersion = "1.0.0",
  modelName    = "claude-sonnet",
): Promise<BenchmarkRun> {
  const startMs = Date.now();
  const suite   = await runEvalSuite(skillName, cases);
  const elapsed = Date.now() - startMs;

  const run: BenchmarkRun = {
    id:           `bench_${Date.now()}_${_seq++}`,
    skillName,
    skillVersion,
    modelName,
    passRate:     suite.passRate,
    avgScore:     suite.avgScore,
    avgScoreBaseline: suite.avgScoreBaseline,
    totalTokens:  suite.results.reduce((s, r) => s + r.tokenUsage, 0),
    elapsedMs:    elapsed,
    suite,
    ranAt:        new Date(),
  };

  const existing = _benchmarks.get(skillName) ?? [];
  _benchmarks.set(skillName, [...existing, run]);
  return run;
}

// ── getBenchmarkHistory ───────────────────────────────────────────────────────

export function getBenchmarkHistory(skillName: string): BenchmarkRun[] {
  return _benchmarks.get(skillName) ?? [];
}

// ── compareBenchmarks ─────────────────────────────────────────────────────────

export function compareBenchmarks(skillName: string): BenchmarkComparison {
  const runs = _benchmarks.get(skillName) ?? [];

  if (runs.length < 2) {
    return {
      skillName,
      runs,
      trend:          "insufficient_data",
      latestRate:     runs[0]?.passRate ?? 0,
      baseline:       runs[0]?.passRate ?? 0,
      delta:          0,
      recommendation: "Run at least 2 benchmark passes to see trends.",
    };
  }

  const baseline   = runs[0].passRate;
  const latest     = runs[runs.length - 1].passRate;
  const delta      = Math.round((latest - baseline) * 1000) / 1000;

  const recentRates = runs.slice(-3).map((r) => r.passRate);
  const isRising    = recentRates.every((r, i) => i === 0 || r >= recentRates[i - 1]);
  const isFalling   = recentRates.every((r, i) => i === 0 || r <= recentRates[i - 1]);

  const trend: BenchmarkComparison["trend"] =
    delta > 0.05  && isRising  ? "improving" :
    delta < -0.05 && isFalling ? "degrading" :
    "stable";

  const recommendation = trend === "degrading"
    ? `Pass rate has dropped ${Math.abs(delta * 100).toFixed(1)}pp since baseline. Run regressionMonitor immediately. Check if a model update changed behavior.`
    : trend === "improving"
    ? `Pass rate has improved +${(delta * 100).toFixed(1)}pp. Confirm skill updates are responsible, not easier test cases.`
    : `Skill is stable. Current pass rate: ${(latest * 100).toFixed(1)}%. Continue routine benchmark cadence.`;

  return { skillName, runs, trend, latestRate: latest, baseline, delta, recommendation };
}
