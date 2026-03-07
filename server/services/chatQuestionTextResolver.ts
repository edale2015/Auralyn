export interface ResolveInput {
  token: string;
  fallbackQuestionText?: string;
  complaintId: string;
}

export function resolveChatQuestionText(input: ResolveInput): string {
  if (input.fallbackQuestionText) {
    return input.fallbackQuestionText;
  }

  return `Please answer: ${input.token.toLowerCase().replace(/_/g, " ")}?`;
}
