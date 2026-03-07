type FollowupCandidate = {
  token: string;
  questionText: string;
  priorityScore?: number;
};

export type FollowupBundle = {
  title: string;
  questions: FollowupCandidate[];
};

export function buildFollowupBundle(
  complaintLabel: string | undefined,
  rankedQuestions: FollowupCandidate[],
  maxQuestions = 3
): FollowupBundle | null {
  if (!rankedQuestions.length) return null;

  const top = rankedQuestions.slice(0, maxQuestions);

  return {
    title: complaintLabel
      ? `A few more questions about ${complaintLabel}`
      : "A few more follow-up questions",
    questions: top,
  };
}
