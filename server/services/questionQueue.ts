import { getTable } from "../data/registry";

export interface SecondaryQuestion {
  secId: string;
  questionId: string;
  bundleId: string;
  system: string;
  chiefComplaint: string;
  questionText: string;
  askOrder: number;
  isRedFlag: boolean;
  recommendedDisposition?: string;
  notes: string;
}

export interface QueueEntry {
  questionId: string;
  bundleId: string;
  askOrder: number;
  isRedFlag: boolean;
  questionText: string;
  answered: boolean;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseBoolean(s: any): boolean {
  const v = String(s ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "YES" || v === "1";
}

function rowToQuestion(row: Record<string, any>): SecondaryQuestion {
  return {
    secId: norm(row.SEC_ID),
    questionId: norm(row.Question_ID),
    bundleId: norm(row.Bundle_ID),
    system: norm(row.System),
    chiefComplaint: norm(row.Chief_Complaint),
    questionText: norm(row.Question_Text),
    askOrder: Number(row.Ask_Order) || 999,
    isRedFlag: parseBoolean(row.Is_Red_Flag),
    recommendedDisposition: norm(row.Recommended_Disposition) || undefined,
    notes: norm(row.Notes),
  };
}

export async function getQuestionsForBundles(bundleIds: string[]): Promise<SecondaryQuestion[]> {
  const allRows = await getTable("GLOBAL_SECONDARY");
  const questions = allRows.map(rowToQuestion).filter(q => q.questionId);

  const bundleSet = new Set(bundleIds.map(b => b.toLowerCase()));
  return questions.filter(q => bundleSet.has(q.bundleId.toLowerCase()));
}

export function buildQuestionQueue(
  questions: SecondaryQuestion[],
  answeredQuestionIds: Set<string>
): QueueEntry[] {
  const seen = new Set<string>();
  const queue: QueueEntry[] = [];

  const sorted = [...questions].sort((a, b) => a.askOrder - b.askOrder);

  for (const q of sorted) {
    const key = q.questionId;
    if (seen.has(key)) continue;
    seen.add(key);

    queue.push({
      questionId: q.questionId,
      bundleId: q.bundleId,
      askOrder: q.askOrder,
      isRedFlag: q.isRedFlag,
      questionText: q.questionText,
      answered: answeredQuestionIds.has(key),
    });
  }

  return queue;
}

export function getNextUnansweredQuestion(queue: QueueEntry[]): QueueEntry | null {
  return queue.find(q => !q.answered) ?? null;
}

export function getRedFlagQuestions(queue: QueueEntry[]): QueueEntry[] {
  return queue.filter(q => q.isRedFlag);
}

export function getUnansweredRedFlags(queue: QueueEntry[]): QueueEntry[] {
  return queue.filter(q => q.isRedFlag && !q.answered);
}

export function getQueueCompletionPct(queue: QueueEntry[]): number {
  if (queue.length === 0) return 100;
  const answered = queue.filter(q => q.answered).length;
  return Math.round((answered / queue.length) * 1000) / 10;
}
