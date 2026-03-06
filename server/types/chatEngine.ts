import type { CaseRecord, CaseEngineResult } from "./case";

export interface ChatEngineRunInput {
  caseRecord: CaseRecord;
}

export interface ChatEngineRunOutput {
  engineResult: CaseEngineResult;
  nextQuestionToken?: string;
  nextQuestionText?: string;
  unansweredCriticalQuestions?: string[];
  completed: boolean;
}
