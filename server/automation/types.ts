export type AutomationFieldType =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "date"
  | "button";

export type AutomationActionType =
  | "goto"
  | "fill"
  | "select"
  | "check"
  | "click"
  | "waitFor"
  | "screenshot"
  | "extractText"
  | "humanApproval"
  | "assertVisible";

export type FieldMapping = {
  internalKey: string;
  selector: string;
  type: AutomationFieldType;
  required?: boolean;
};

export type AutomationAction = {
  type: AutomationActionType;
  name: string;
  selector?: string;
  valueKey?: string;
  url?: string;
  timeoutMs?: number;
  screenshotLabel?: string;
  checkpointName?: string;
  expectedText?: string;
};

export type AutomationTemplate = {
  templateKey: string;
  name: string;
  description?: string;
  targetType: "web";
  startUrl: string;
  loginUrl?: string;
  fields: FieldMapping[];
  actions: AutomationAction[];
};

export type AutomationRunInput = {
  templateKey: string;
  payload: Record<string, any>;
  clinicId?: string;
  startedBy?: string;
  traceId?: string;
};

export type PageFieldCandidate = {
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  selectorGuess?: string;
};

export type PageInterpretation = {
  title: string;
  url: string;
  fields: PageFieldCandidate[];
  buttons: Array<{
    text?: string;
    id?: string;
    name?: string;
  }>;
  links: Array<{
    text?: string;
    href?: string;
  }>;
};
