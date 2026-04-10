const COMPLAINT_GRAPH: Record<string, string[]> = {
  chest_pain:    ["radiation", "duration", "exertion", "diaphoresis"],
  fever:         ["temp", "duration", "contacts", "rash"],
  shortness_of_breath: ["onset", "severity", "exertion", "orthopnea"],
  abdominal_pain: ["location", "duration", "nausea", "last_meal"],
  headache:      ["severity", "onset", "photophobia", "neck_stiffness"],
};

export function dynamicQuestionGraph(ctx: { complaint: string }): string[] {
  return COMPLAINT_GRAPH[ctx.complaint] ?? [];
}

const MACROS: Record<string, string[]> = {
  ER:      ["notify", "dispatchEMS", "prepTrauma"],
  Urgent:  ["notify", "expediteRoom"],
  Routine: ["scheduleFollowup", "sendInstructions"],
};

export function physicianMacro(action: string): string[] {
  return MACROS[action] ?? [];
}
