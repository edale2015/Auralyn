import { loadComplaintConfig } from "./complaintConfigLoader";
import type { CoreQuestion } from "./complaintConfigLoader";

export async function planNextQuestion(
  complaintId: string,
  answers: Record<string, unknown>,
  unansweredCriticalQuestions: string[] = []
): Promise<{
  token?: string;
  text?: string;
  completed: boolean;
}> {
  if (unansweredCriticalQuestions.length > 0) {
    const token = unansweredCriticalQuestions[0];
    return {
      token,
      text: `Please answer: ${token.toLowerCase().replace(/_/g, " ")}?`,
      completed: false,
    };
  }

  const cfg = await loadComplaintConfig(complaintId);
  if (!cfg) {
    return { completed: true };
  }

  const questions: CoreQuestion[] = [...cfg.coreQuestions].sort(
    (a, b) => a.askOrder - b.askOrder
  );

  for (const q of questions) {
    const token = q.qId;
    const val = answers[token];
    const alreadyAnswered = val !== undefined && val !== null && val !== "";

    if (alreadyAnswered) continue;

    return {
      token,
      text: q.questionText,
      completed: false,
    };
  }

  return { completed: true };
}
