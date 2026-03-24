import { ExamProtocol, registerProtocol } from "./examProtocolEngine";

export const rashProtocol: ExamProtocol = {
  id: "rash_v1",
  complaint: "rash",
  steps: [
    { type: "ask", question: "How long have you had the rash?", field: "duration_days" },
    { type: "ask", question: "Is the rash spreading?", field: "spreading" },
    { type: "ask", question: "Do you have a fever?", field: "fever" },
    { type: "ask", question: "Is the rash itchy, painful, or both?", field: "character" },
    { type: "ask", question: "Any recent new medication, food, or insect bite?", field: "trigger" },
    { type: "ask", question: "Do you have difficulty breathing or throat tightness?", field: "anaphylaxis_signs" },

    {
      type: "decision",
      rule: (ctx) => ctx.anaphylaxis_signs === true || ctx.anaphylaxis_signs === "yes",
      next: "anaphylaxis_emergency",
      escalate: true,
    },

    { type: "robot", action: { type: "home" } },
    { type: "robot", action: { type: "set_light", intensity: 80 } },
    { type: "robot", action: { type: "move", axis: "z", value: 12 } },
    { type: "robot", action: { type: "capture_image" } },

    { type: "vision", target: "rash" },

    {
      type: "score",
      field: "severity_score",
      fn: (ctx) => {
        let s = 0;
        if (ctx.fever === true || ctx.fever === "yes") s += 2;
        if (ctx.spreading === true || ctx.spreading === "yes") s += 2;
        const rash = ctx.rash as Record<string, unknown> | undefined;
        if (rash?.blisters) s += 3;
        if (rash?.purpura) s += 4;
        return s;
      },
      escalateAbove: 5,
    },

    {
      type: "decision",
      rule: (ctx) => {
        const rash = ctx.rash as Record<string, unknown> | undefined;
        return (rash?.purpura === true || rash?.petechiae === true) &&
          (ctx.fever === true || ctx.fever === "yes");
      },
      next: "meningococcal_rule_out",
      escalate: true,
    },

    {
      type: "decision",
      rule: (ctx) => {
        const rash = ctx.rash as Record<string, unknown> | undefined;
        return rash?.blisters === true;
      },
      next: "vesicular_rash_workup",
    },
  ],
};

registerProtocol(rashProtocol);
