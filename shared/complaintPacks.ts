export type ComplaintQuestionType =
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "text"
  | "number"
  | "duration"
  | "severity";

export interface ComplaintQuestionOption {
  label: string;
  value: string;
  redFlag?: boolean;
}

export interface ComplaintQuestion {
  id: string;
  prompt: string;
  type: ComplaintQuestionType;
  required?: boolean;
  priority: number;
  options?: ComplaintQuestionOption[];
  helpText?: string;
  stopIfAnswered?: boolean;
}

export interface ComplaintPack {
  complaintId: string;
  aliases: string[];
  title: string;
  ageBands?: Array<"infant" | "child" | "teen" | "adult" | "older_adult">;
  coreQuestions: ComplaintQuestion[];
  redFlagTriggers: string[];
  autoEscalateRules: string[];
  autoReviewRules: string[];
  likelyDisposition:
    | "self_care"
    | "office_followup"
    | "telemed_now"
    | "urgent_care"
    | "er_now";
  planTemplateKey: string;
}
