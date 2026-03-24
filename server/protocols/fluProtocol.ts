import { ExamProtocol, registerProtocol } from "./examProtocolEngine";

export const fluProtocol: ExamProtocol = {
  id: "flu_v1",
  complaint: "flu_like",
  steps: [
    { type: "ask", question: "How many days have you felt unwell?", field: "duration_days" },
    { type: "ask", question: "Do you have a fever above 38°C?", field: "fever" },
    { type: "ask", question: "Do you have muscle aches?", field: "myalgia" },
    { type: "ask", question: "Do you have a cough?", field: "cough" },
    { type: "ask", question: "Any shortness of breath?", field: "dyspnea" },
    { type: "ask", question: "Are you in a high-risk group (age >65, immunocompromised, pregnant)?", field: "high_risk" },

    {
      type: "decision",
      rule: (ctx) => ctx.dyspnea === true || ctx.dyspnea === "yes",
      next: "respiratory_distress_evaluation",
      escalate: true,
    },

    { type: "device", device: "spo2" },

    {
      type: "score",
      field: "flu_severity_score",
      fn: (ctx) => {
        let s = 0;
        if (ctx.fever === true || ctx.fever === "yes") s += 2;
        if (ctx.myalgia === true || ctx.myalgia === "yes") s++;
        if (ctx.cough === true || ctx.cough === "yes") s++;
        if (ctx.high_risk === true || ctx.high_risk === "yes") s += 2;
        const spo2 = ctx.spo2 as Record<string, unknown> | undefined;
        if (typeof spo2?.value === "number" && spo2.value < 94) s += 3;
        return s;
      },
      escalateAbove: 5,
    },

    {
      type: "decision",
      rule: (ctx) =>
        (ctx.fever === true || ctx.fever === "yes") &&
        (ctx.myalgia === true || ctx.myalgia === "yes") &&
        (ctx.cough === true || ctx.cough === "yes"),
      next: "flu_positive_criteria_met",
    },

    {
      type: "decision",
      rule: (ctx) => (ctx.high_risk === true || ctx.high_risk === "yes"),
      next: "antiviral_consideration_high_risk",
    },
  ],
};

registerProtocol(fluProtocol);
