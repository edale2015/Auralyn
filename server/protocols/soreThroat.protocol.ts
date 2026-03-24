import { ExamProtocol, registerProtocol } from "./examProtocolEngine";

export const soreThroatProtocol: ExamProtocol = {
  id: "sore_throat_v1",
  complaint: "sore_throat",
  steps: [
    { type: "ask", question: "How long have you had the sore throat?", field: "duration_days" },
    { type: "ask", question: "Do you have a fever above 38°C (100.4°F)?", field: "fever" },
    { type: "ask", question: "Do you have a cough?", field: "cough" },
    { type: "ask", question: "Any swollen neck glands?", field: "lymphadenopathy" },
    { type: "ask", question: "Have you had close contact with a strep case in the last 2 weeks?", field: "strep_exposure" },

    { type: "robot", action: { type: "home" } },
    { type: "robot", action: { type: "focus", target: "throat" } },
    { type: "robot", action: { type: "set_light", intensity: 90 } },
    { type: "robot", action: { type: "move", axis: "z", value: 8 } },

    { type: "vision", target: "throat" },

    {
      type: "score",
      field: "centor_score",
      fn: (ctx) => {
        let score = 0;
        if (ctx.fever === true || ctx.fever === "yes") score++;
        if (ctx.cough === false || ctx.cough === "no") score++;
        if (ctx.lymphadenopathy === true || ctx.lymphadenopathy === "yes") score++;
        const throat = ctx.throat as Record<string, unknown> | undefined;
        if (throat?.exudates) score++;
        return score;
      },
      escalateAbove: 3,
    },

    {
      type: "decision",
      rule: (ctx) => {
        const throat = ctx.throat as Record<string, unknown> | undefined;
        return (
          (throat?.exudates === true) &&
          (ctx.fever === true || ctx.fever === "yes") &&
          !(ctx.cough === true || ctx.cough === "yes")
        );
      },
      next: "high_strep_probability",
    },

    {
      type: "decision",
      rule: (ctx) => {
        const score = ctx.centor_score as number;
        return score >= 3;
      },
      next: "strep_test_recommended",
    },
  ],
};

registerProtocol(soreThroatProtocol);
