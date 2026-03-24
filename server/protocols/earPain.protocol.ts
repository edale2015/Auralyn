import { ExamProtocol, registerProtocol } from "./examProtocolEngine";

export const earPainProtocol: ExamProtocol = {
  id: "ear_pain_v1",
  complaint: "ear_pain",
  steps: [
    { type: "ask", question: "Which ear is affected — left, right, or both?", field: "side" },
    { type: "ask", question: "Do you have hearing loss in the affected ear?", field: "hearing_loss" },
    { type: "ask", question: "Is there any discharge from the ear?", field: "discharge" },
    { type: "ask", question: "Do you have a fever?", field: "fever" },
    { type: "ask", question: "Do you have jaw pain or pain on chewing?", field: "tmj_pain" },
    { type: "ask", question: "Any recent upper respiratory infection in the last 2 weeks?", field: "recent_uri" },

    { type: "robot", action: { type: "home" } },
    { type: "robot", action: { type: "focus", target: "ear" } },
    { type: "robot", action: { type: "set_light", intensity: 95 } },
    { type: "robot", action: { type: "move", axis: "z", value: 5 } },

    { type: "vision", target: "ear" },

    {
      type: "decision",
      rule: (ctx) => {
        const ear = ctx.ear as Record<string, unknown> | undefined;
        return (
          (ear?.bulging === true || ear?.perforation === true) &&
          (ctx.fever === true || ctx.fever === "yes")
        );
      },
      next: "acute_otitis_media_severe",
      escalate: true,
    },

    {
      type: "decision",
      rule: (ctx) => {
        const ear = ctx.ear as Record<string, unknown> | undefined;
        return ear?.erythema === true && (ctx.recent_uri === true || ctx.recent_uri === "yes");
      },
      next: "acute_otitis_media_mild",
    },

    {
      type: "decision",
      rule: (ctx) => ctx.discharge === true || ctx.discharge === "yes",
      next: "otitis_externa_or_perforation",
    },
  ],
};

registerProtocol(earPainProtocol);
