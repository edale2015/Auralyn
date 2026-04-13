/**
 * evalEngine.ts — Core skill evaluation system
 *
 * Article 28a (Eval Engine): "runEvalSuite(skillName, cases) — runs all cases
 *  in parallel. For each case: spawn two agents simultaneously (with skill,
 *  without skill) in isolated contexts. compareOutputs returns pass/score/diff."
 *
 * Article 29 (Skill Evals): "skill-creator operates in four modes:
 *   Create  — unchanged (describe workflow → SKILL.md)
 *   Eval    — define test prompts + expected output → run with/without skill
 *   Improve — optimize frontmatter description for trigger accuracy
 *   Benchmark — standardized assessment, track metrics across versions"
 *
 * The article's key insight about parallel A/B:
 *   "When skill-creator runs your evals, it spawns two independent agents for
 *    each test case: one with the skill loaded, one without. They run
 *    simultaneously in clean, isolated contexts."
 *
 * Two types of skill failures (Article 29):
 *   Capability uplift: "A team built a skill for Excel formatting. Six months
 *    later, evals showed the base model passed nearly all the same cases —
 *    the model absorbed the techniques. They retired the skill."
 *   Encoded preference: "A finance team built a skill for monthly variance
 *    reports. The CFO changed the template. For three weeks Claude generated
 *    reports in the old format. Evals catch this drift."
 *
 * Clinical translation:
 *   Eval the sepsis-triage skill: does it actually improve detection accuracy
 *   vs the base model? Track regression after every model update.
 */

import { runEvalCase } from "./evalRunner";
import { compareOutputs, assessSkillNecessity } from "./comparator";
import type { ClinicalOutput } from "./comparator";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvalCase {
  id:       string;
  input:    {
    vitals?:   Record<string, number>;
    labs?:     Record<string, number>;
    symptoms?: string[];
    patientId?: string;
    notes?:    string;
  };
  expected: ClinicalOutput;
  tags?:    string[];
}

export interface EvalResult {
  id:            string;
  passed:        boolean;
  score:         number;              // score for with-skill output
  scoreBaseline: number;             // score for without-skill output
  withSkill:     ClinicalOutput;
  withoutSkill:  ClinicalOutput;
  diff:          ReturnType<typeof compareOutputs>["diff"];
  tokenUsage:    number;             // total tokens (both runs)
  elapsedMs:     number;
}

export interface EvalSuiteResult {
  skillName:       string;
  totalCases:      number;
  passedCases:     number;
  passRate:        number;           // 0-1
  avgScore:        number;
  avgScoreBaseline: number;
  necessity:       ReturnType<typeof assessSkillNecessity>;
  results:         EvalResult[];
  ranAt:           Date;
}

// ── EvalCase store ────────────────────────────────────────────────────────────

const _cases  = new Map<string, EvalCase[]>();   // skillName → cases
const _suites = new Map<string, EvalSuiteResult[]>();

export function registerEvalCases(skillName: string, cases: EvalCase[]): void {
  _cases.set(skillName, [...(_cases.get(skillName) ?? []), ...cases]);
}

export function getEvalCases(skillName: string): EvalCase[] {
  return _cases.get(skillName) ?? [];
}

// ── runEvalSuite ──────────────────────────────────────────────────────────────

export async function runEvalSuite(
  skillName: string,
  cases:     EvalCase[],
  passThreshold = 0.9,
): Promise<EvalSuiteResult> {
  const results: EvalResult[] = [];

  // Article: "Promise.all — parallel execution for each test case"
  await Promise.all(
    cases.map(async (testCase) => {
      // Two isolated agents spawned simultaneously per test case
      const [withSkillRun, withoutSkillRun] = await Promise.all([
        runEvalCase(testCase, true, skillName),
        runEvalCase(testCase, false, skillName),
      ]);

      // Blind comparator: output A vs output B (no labels)
      const comparison = compareOutputs(
        testCase.expected,
        withSkillRun.output,   // A (but comparator doesn't know this is "with skill")
        withoutSkillRun.output, // B
        passThreshold,
      );

      results.push({
        id:            testCase.id,
        passed:        comparison.passed,
        score:         comparison.scoreA,
        scoreBaseline: comparison.scoreB,
        withSkill:     withSkillRun.output,
        withoutSkill:  withoutSkillRun.output,
        diff:          comparison.diff,
        tokenUsage:    withSkillRun.tokenUsage + withoutSkillRun.tokenUsage,
        elapsedMs:     Math.max(withSkillRun.elapsedMs, withoutSkillRun.elapsedMs),
      });
    })
  );

  const passedCases     = results.filter((r) => r.passed).length;
  const passRate        = results.length > 0 ? passedCases / results.length : 0;
  const avgScore        = avg(results.map((r) => r.score));
  const avgScoreBaseline = avg(results.map((r) => r.scoreBaseline));
  const necessity       = assessSkillNecessity(
    results.map((r) => r.score),
    results.map((r) => r.scoreBaseline),
  );

  const suite: EvalSuiteResult = {
    skillName,
    totalCases:   results.length,
    passedCases,
    passRate:     Math.round(passRate * 1000) / 1000,
    avgScore:     Math.round(avgScore * 1000) / 1000,
    avgScoreBaseline: Math.round(avgScoreBaseline * 1000) / 1000,
    necessity,
    results,
    ranAt: new Date(),
  };

  // Store for benchmark tracking
  _suites.set(skillName, [...(_suites.get(skillName) ?? []), suite]);
  return suite;
}

export function getSuiteHistory(skillName: string): EvalSuiteResult[] {
  return _suites.get(skillName) ?? [];
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
