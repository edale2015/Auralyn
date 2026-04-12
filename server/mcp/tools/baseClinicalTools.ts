import { medicalMCP } from "../medicalMCP";

medicalMCP.register({
  name:        "intake.collect",
  description: "Collect and normalise patient intake information",
  async execute(input) {
    return {
      ...input,
      intakeComplete: true,
      vitals:         input.vitals   ?? {},
      symptoms:       input.symptoms ?? {},
    };
  },
});

medicalMCP.register({
  name:        "questions.nextBest",
  description: "Choose the next highest-yield clinical question",
  async execute(input) {
    if (input.complaint === "cough" && !("sob" in (input.symptoms ?? {}))) {
      return { ...input, nextQuestion: "Do you have shortness of breath?" };
    }
    if (input.complaint === "fever" && !("confusion" in (input.symptoms ?? {}))) {
      return { ...input, nextQuestion: "Are you experiencing any confusion or altered mental status?" };
    }
    return {
      ...input,
      nextQuestion: "Any chest pain, fever, or worsening symptoms?",
    };
  },
});

medicalMCP.register({
  name:        "diagnosis.run",
  description: "Run core diagnosis logic against symptoms and vitals",
  async execute(input) {
    const tempF     = Number(input.vitals?.tempF ?? 98.6);
    const sob       = Boolean(input.symptoms?.sob);
    const chestPain = Boolean(input.symptoms?.chestPain);
    const confusion = Boolean(input.symptoms?.confusion);

    if (tempF >= 102.5 && confusion) {
      return {
        ...input,
        diagnosis:           "Possible sepsis / serious infection",
        diagnosisCandidates: [{ name: "Possible sepsis / serious infection", probability: 0.88 }],
        confidence:          0.88,
      };
    }

    if (chestPain || sob) {
      return {
        ...input,
        diagnosis:           "Cardiopulmonary concern",
        diagnosisCandidates: [{ name: "Cardiopulmonary concern", probability: 0.76 }],
        confidence:          0.76,
      };
    }

    return {
      ...input,
      diagnosis:           "Viral URI",
      diagnosisCandidates: [{ name: "Viral URI", probability: 0.87 }],
      confidence:          0.87,
    };
  },
});

medicalMCP.register({
  name:        "risk.assess",
  description: "Assign a risk level from diagnosis confidence",
  async execute(input) {
    const confidence = Number(input.confidence ?? 0);
    const riskLevel  =
      confidence >= 0.8 ? "low" :
      confidence >= 0.65 ? "moderate" : "high";
    return { ...input, riskLevel };
  },
});

medicalMCP.register({
  name:        "disposition.determine",
  description: "Determine final patient disposition",
  async execute(input) {
    if (input.riskLevel === "critical" || input.riskLevel === "high") {
      return { ...input, disposition: "ED now" };
    }
    return { ...input, disposition: "Home care with follow-up" };
  },
});

medicalMCP.register({
  name:        "ehr.document",
  description: "Document encounter in EHR (stub — production wraps Playwright/Athena adapter)",
  async execute(input) {
    return { ...input, documented: true };
  },
});
