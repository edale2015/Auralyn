export interface ReviewSuggestion {
  area: string;
  suggestion: string;
  priority: "low" | "medium" | "high";
}

export function reviewCaseForCompleteness(caseData: any): ReviewSuggestion[] {
  const suggestions: ReviewSuggestion[] = [];

  if (!caseData?.engineResult) suggestions.push({ area: "engine", suggestion: "No engine result — case needs triage processing", priority: "high" });
  if (!caseData?.noteDraft) suggestions.push({ area: "note", suggestion: "Missing note draft — generate before export", priority: "medium" });
  if (Object.keys(caseData?.answers ?? {}).length < 3) suggestions.push({ area: "intake", suggestion: "Fewer than 3 answers — intake may be incomplete", priority: "medium" });
  if ((caseData?.unansweredCriticalQuestions ?? []).length > 0) suggestions.push({ area: "critical_questions", suggestion: `${caseData.unansweredCriticalQuestions.length} unanswered critical questions`, priority: "high" });

  return suggestions;
}
