export interface PatientExplanation {
  message: string;
  nextSteps: string;
  reassurance: string;
  urgency: "routine" | "soon" | "urgent" | "emergency";
  plainEnglish: string;
}

export function patientExplanation(result: {
  topDiagnosis?: string;
  disposition?: string;
  confidence?: number;
  keyFactors?: string[];
}): PatientExplanation {
  const dx = result.topDiagnosis ?? "your symptoms";
  const disposition = result.disposition ?? "ROUTINE";

  const dxMap: Record<string, string> = {
    streptococcal_pharyngitis: "a bacterial throat infection (strep throat)",
    viral_uri: "a common cold or viral infection",
    influenza: "the flu",
    community_acquired_pneumonia: "a lung infection (pneumonia)",
    pulmonary_embolism: "a potentially serious lung condition",
    J00:  "a common cold or upper respiratory infection",
    J02_0: "a bacterial throat infection",
    I26:  "a serious clot in the lungs",
    J18_9: "a lung infection",
  };

  const humanDx = dxMap[dx] ?? dx.replace(/_/g, " ");

  const dispositionMap: Record<string, { nextSteps: string; urgency: PatientExplanation["urgency"]; reassurance: string }> = {
    ER_NOW: {
      nextSteps: "Please go to the emergency room right away or call 911.",
      urgency: "emergency",
      reassurance: "This is important — getting care quickly is the right decision.",
    },
    URGENT_24H: {
      nextSteps: "Please see a doctor or visit an urgent care clinic today or tomorrow.",
      urgency: "urgent",
      reassurance: "Getting checked soon will help you feel better faster.",
    },
    ROUTINE: {
      nextSteps: "Schedule an appointment with your doctor within the next week.",
      urgency: "routine",
      reassurance: "This doesn't seem urgent, but follow-up is still important.",
    },
    SELF_CARE: {
      nextSteps: "Rest, stay hydrated, and take over-the-counter medication as needed.",
      urgency: "routine",
      reassurance: "Most people recover well with self-care at home.",
    },
    MONITOR: {
      nextSteps: "Keep an eye on your symptoms and seek care if they worsen.",
      urgency: "soon",
      reassurance: "If symptoms get worse or you're concerned, don't hesitate to call your doctor.",
    },
  };

  const mapped = dispositionMap[disposition] ?? dispositionMap["ROUTINE"];

  return {
    message: `Based on your symptoms, we think you may have ${humanDx}.`,
    nextSteps: mapped.nextSteps,
    reassurance: mapped.reassurance + " If symptoms worsen, seek care immediately.",
    urgency: mapped.urgency,
    plainEnglish: `You likely have ${humanDx}. ${mapped.nextSteps}`,
  };
}

export function getPatientExplanationStats() {
  return { active: true, supportedDiagnoses: 9, urgencyLevels: 4 };
}
