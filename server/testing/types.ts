export type Tri = "Yes" | "No" | "Not sure";

export type Scenario = {
  runId: string;
  ts: number;
  system: string;
  flowId: string;
  chiefComplaint: string;
  routerText: string;
  answers: Record<string, Tri>;
  modifiers?: Record<string, any>;
  tags?: string[];
};

export type SystemOutput = {
  disposition: string;
  redFlag: boolean;
  raw: any;
};

export type Expected = {
  expectedDisposition: "urgent_or_ed" | "routine_or_supportive";
  reasons: string[];
};

export type Score = {
  pass: boolean;
  severity: number;
  issues: { code: string; message: string }[];
};

export type TestRunRecord = {
  runId: string;
  ts: number;
  system: string;
  flowId: string;
  chiefComplaint: string;
  routerText: string;
  answers: Record<string, Tri>;
  modifiers?: Record<string, any>;
  expected: Expected;
  output: SystemOutput;
  score: Score;
  tags?: string[];
};
