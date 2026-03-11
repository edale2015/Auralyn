import { SkillContext, SkillResult } from "../skills/shared/skillTypes";
import { GRAPH_EDGES } from "./graphEdgeRegistry";
import * as Guards from "./graphGuards";
import { scoreNextSkillCandidate } from "./graphPolicies";

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

    const candidates = GRAPH_EDGES
      .filter((e) => e.from === current)
      .filter((e) => !completed.includes(e.to))
      .filter((e) => guardPasses(e.guardName, contextForStep))
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

    if (!candidates.length) break;

    const next = candidates[0];
    const runner = params.runSkill[next.to];
    if (!runner) throw new Error(`No runner for graph skill: ${next.to}`);

    const result = await runner(contextForStep);
    skillResults[next.to] = result;
    completed.push(next.to);
    totalEstimatedCostUsd += Number(result.audit.estimatedCostUsd ?? 0);
    current = next.to;
  }

  return {
    completedSkills: completed,
    skillResults,
    totalEstimatedCostUsd,
  };
}
