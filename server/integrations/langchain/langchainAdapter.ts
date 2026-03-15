export interface LangChainReasoningInput {
  complaint: string;
  differential: { diagnosis: string; score: number }[];
  confidence: string;
}

export function langchainReasoning(input: LangChainReasoningInput): { explanation: string } {
  const top = input.differential[0]?.diagnosis ?? 'unknown';
  return {
    explanation: `LangChain reasoning stub — top differential: ${top} (confidence: ${input.confidence}). Wire to live LangChain endpoint via server/routes/langchainRoutes.ts.`,
  };
}
