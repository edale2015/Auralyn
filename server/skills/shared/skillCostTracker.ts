import { SkillResult } from "./skillTypes";

export type SkillCostPolicy = {
  llmCostPer1kPromptTokensUsd: number;
  llmCostPer1kCompletionTokensUsd: number;
};

export const DEFAULT_COST_POLICY: SkillCostPolicy = {
  llmCostPer1kPromptTokensUsd: 0.002,
  llmCostPer1kCompletionTokensUsd: 0.006,
};

export function estimateSkillCost(params: {
  engineType?: "rules" | "hybrid" | "llm" | "retrieval";
  promptTokens?: number;
  completionTokens?: number;
  policy?: SkillCostPolicy;
}): number {
  const { engineType, promptTokens = 0, completionTokens = 0 } = params;
  const policy = params.policy ?? DEFAULT_COST_POLICY;

  if (engineType !== "llm" && engineType !== "hybrid") return 0;

  return (
    (promptTokens / 1000) * policy.llmCostPer1kPromptTokensUsd +
    (completionTokens / 1000) * policy.llmCostPer1kCompletionTokensUsd
  );
}

export function attachCostMetadata<T>(
  result: SkillResult<T>,
  params: {
    engineType?: "rules" | "hybrid" | "llm" | "retrieval";
    promptTokens?: number;
    completionTokens?: number;
    modelUsed?: string;
    complaintFamily?: string;
  }
): SkillResult<T> {
  const estimatedCostUsd = estimateSkillCost({
    engineType: params.engineType,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
  });

  return {
    ...result,
    audit: {
      ...result.audit,
      modelUsed: params.modelUsed,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      estimatedCostUsd,
      complaintFamily: params.complaintFamily,
    },
  };
}
