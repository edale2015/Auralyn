import { QuestionType } from "./packRows";

export interface PackQuestionRow {
  id: string;
  packId: string;
  questionId: string;
  prompt: string;
  type: QuestionType;
  priority: number;
  required: boolean;
  optionsJson?: string;
  helpText?: string;
  isActive: boolean;
  version: number;
}
