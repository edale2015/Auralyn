/**
 * evalRunner.ts — Isolated eval case execution
 *
 * Article 29 (Skill Evals): "When skill-creator runs your evals, it spawns
 *  two independent agents for each test case: one with the skill loaded, one
 *  without. They run simultaneously in clean, isolated contexts. Running tests
 *  sequentially creates context bleed. If eval #1 produces a long output, that
 *  output is sitting in context when eval #2 runs and it can influence grading."
 *
 * Article 28a (Eval Engine): "runEvalCase(testCase, useSkill, skillName)
 *  calls executeClinicalSkill with isolated: true (prevents context bleed)"
 *
 * Isolation guarantees:
 *   - Each call gets a fresh contextId (simulating a fresh context window)
 *   - No shared state between with-skill and without-skill runs
 *   - No shared state between sequential eval cases (each has own ctx)
 *
 * Clinical translation:
 *   With skill:    AI has access to the sepsis protocol skill, which guides it
 *                  through Hour-1 bundle, NEWS2 scoring, qSOFA thresholds
 *   Without skill: AI operates from base knowledge only — no structured guidance
 *   Difference:    How much does the skill actually improve clinical outcomes?
 */

import { randomUUID } from "crypto";
import type { EvalCase } from "./evalEngine";
import type { ClinicalOutput } from "./comparator";

export interface RunContext {
  contextId:  string;    // unique per run — ensures isolation
  skillName:  string | null;
  useSkill:   boolean;
  isolated:   boolean;
}

export interface EvalRunResult {
  caseId:     string;
  contextId:  string;
  useSkill:   boolean;
  output:     ClinicalOutput;
  tokenUsage: number;
  elapsedMs:  number;
}

// ── Clinical skill executor (in-process simulation) ───────────────────────────

function executeClinicalSkill(params: {
  input:    EvalCase["input"];
  skill:    string | null;
  isolated: boolean;
  ctx:      RunContext;
}): ClinicalOutput {
  const { input, skill } = params;
  const vitals   = input.vitals   ?? {};
  const labs     = input.labs     ?? {};
  const symptoms = input.symptoms ?? [];

  // Without skill: base model heuristics only (may miss nuances)
  if (!skill) {
    const qsofaRr   = (vitals.rr ?? 0) >= 22 ? 1 : 0;
    const qsofaSbp  = (vitals.sbp ?? 120) <= 100 ? 1 : 0;
    const qsofa     = qsofaRr + qsofaSbp;

    return {
      diagnosis:   qsofa >= 2 ? "Sepsis suspected" : "Observation",
      disposition: (vitals.sbp ?? 120) < 90 ? "ICU admission" : "ED monitoring",
      orders:      qsofa >= 2 ? ["Blood cultures", "Antibiotics"] : [],
      score:       qsofa,
      reasoning:   `Base model: qSOFA ${qsofa}`,
    };
  }

  // With skill: structured clinical protocol (more complete)
  const news2Score = computeNEWS2Quick(vitals);
  const qsofaScore = computeQSOFAQuick(vitals);
  const lactatHigh = (labs.lactate ?? 0) > 2;

  const sepsisRisk = news2Score > 5 || qsofaScore >= 2 || lactatHigh;

  const diagnosis   = sepsisRisk ? "Sepsis (qSOFA ≥ 2 or NEWS2 > 5 or lactate > 2)" : "No sepsis criteria met";
  const disposition = sepsisRisk
    ? (vitals.sbp ?? 120) < 90 || (labs.lactate ?? 0) > 4 ? "ICU admission" : "Hospital admission"
    : "ED monitoring";
  const orders = sepsisRisk
    ? ["Blood cultures × 2", "Broad-spectrum antibiotics", "30mL/kg IV crystalloid", "Lactate level", "CBC/BMP/LFTs"]
    : ["Vital signs monitoring", "IV access"];

  return { diagnosis, disposition, orders, score: news2Score, reasoning: `Skill: NEWS2=${news2Score} qSOFA=${qsofaScore} lactate=${labs.lactate ?? "N/A"}` };
}

function computeNEWS2Quick(v: Record<string, number>): number {
  let s = 0;
  if ((v.rr  ?? 0)  > 25) s += 3;
  if ((v.spo2 ?? 98) < 92) s += 3;
  if ((v.temp ?? 37) > 38.5) s += 2;
  if ((v.sbp ?? 120) < 90) s += 3;
  if ((v.hr  ?? 80)  > 130) s += 3;
  return s;
}

function computeQSOFAQuick(v: Record<string, number>): number {
  let s = 0;
  if ((v.rr  ?? 0)   >= 22)  s += 1;
  if ((v.sbp ?? 120) <= 100) s += 1;
  return s;
}

// ── runEvalCase ───────────────────────────────────────────────────────────────

export async function runEvalCase(
  testCase: EvalCase,
  useSkill: boolean,
  skillName: string,
): Promise<EvalRunResult> {
  const startMs = Date.now();
  const ctx: RunContext = {
    contextId: `ctx_${randomUUID()}`,  // fresh context — no bleed
    skillName:  useSkill ? skillName : null,
    useSkill,
    isolated:   true,
  };

  const output = executeClinicalSkill({
    input:    testCase.input,
    skill:    useSkill ? skillName : null,
    isolated: true,
    ctx,
  });

  // Estimate token usage (approximate)
  const tokenUsage = Math.ceil(JSON.stringify(output).length / 4) + Math.ceil(JSON.stringify(testCase.input).length / 4);

  return {
    caseId:    testCase.id,
    contextId: ctx.contextId,
    useSkill,
    output,
    tokenUsage,
    elapsedMs: Date.now() - startMs,
  };
}
