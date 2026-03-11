import { SkillContext, SkillResult } from "../skills/shared/skillTypes";
import { GRAPH_EDGES } from "./graphEdgeRegistry";
import * as Guards from "./graphGuards";
import { scoreNextSkillCandidate } from "./graphPolicies";
import { appendGraphTraceLog } from "./graphTraceLogger";

type SkillRunnerMap = Record<
  string,
  (context: SkillContext) => Promise<SkillResult>
>;

function guardPasses(guardName: string, context: SkillContext): boolean {
  if (guardName === "always") return true;
  const fn = (Guards as any)[guardName];
  if (typeof fn !== "function") return false;
  return Boolean(fn(context));
}

export async function runReasoningGraph(params: {
  initialContext: SkillContext;
  runSkill: SkillRunnerMap;
}) {
  const completed: string[] = [];
  const skillResults: Record<string, SkillResult> = {};
  let current = "START";
  let totalEstimatedCostUsd = 0;

  for (let step = 0; step < 50; step++) {
    const contextForStep: SkillContext = {
      ...params.initialContext,
      complaintId:
        skillResults["identify_chief_complaint"]?.result?.complaint_id ??
        params.initialContext.complaintId,
      modifiers:
        skillResults["collect_modifiers"]?.result?.modifiers ??
        params.initialContext.modifiers,
      knownFacts:
        skillResults["normalize_patient_story"]?.result?.structured_facts ??
        params.initialContext.knownFacts,
      priorSkillOutputs: skillResults,
    };

    const rawCandidates = GRAPH_EDGES
      .filter((e) => e.from === current)
      .filter((e) => !completed.includes(e.to))
      .map((e) => {
        const passed = guardPasses(e.guardName, contextForStep);
        return { ...e, guardPassed: passed };
      });

    const candidates = rawCandidates
      .filter((e) => e.guardPassed)
      .map((e) => ({
        ...e,
        score: scoreNextSkillCandidate({
          skillName: e.to,
          context: contextForStep,
          currentCaseEstimatedCostUsd: totalEstimatedCostUsd,
          basePriority: e.priority ?? 0,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    await appendGraphTraceLog({
      caseId: contextForStep.caseId,
      step: step + 1,
      currentNode: current,
      complaintId: contextForStep.complaintId ?? "",
      totalEstimatedCostUsd,
      rawCandidates: rawCandidates.map((c) => ({
        from: c.from,
        to: c.to,
        guardName: c.guardName,
        guardPassed: c.guardPassed,
        priority: c.priority ?? 0,
      })),
      scoredCandidates: candidates.map((c) => ({
        from: c.from,
        to: c.to,
        guardName: c.guardName,
        score: c.score,
      })),
      chosenEdge: candidates[0]
        ? {
            from: candidates[0].from,
            to: candidates[0].to,
            guardName: candidates[0].guardName,
            score: candidates[0].score,
          }
        : null,
    });

    if (!candidates.length) break;

    const next = candidates[0];
    const runner = params.runSkill[next.to];
    if (!runner) throw new Error(`No runner for graph skill: ${next.to}`);

    const result = await runner(contextForStep);
    skillResults[next.to] = result;
    completed.push(next.to);
    totalEstimatedCostUsd += Number(result.audit.estimatedCostUsd ?? 0);
    current = next.to;

    await appendGraphTraceLog({
      caseId: contextForStep.caseId,
      step: step + 1,
      executedNode: next.to,
      resultStatus: result.status,
      confidence: result.confidence,
      reasoning_summary: result.reasoning_summary,
      ruleHits: result.audit.ruleHits ?? [],
      missingData: result.audit.missingData ?? [],
      latencyMs: result.audit.latencyMs ?? 0,
      estimatedCostUsd: result.audit.estimatedCostUsd ?? 0,
      nextRecommendedSkills: result.nextRecommendedSkills ?? [],
    });
  }

  return {
    completedSkills: completed,
    skillResults,
    totalEstimatedCostUsd,
  };
}
