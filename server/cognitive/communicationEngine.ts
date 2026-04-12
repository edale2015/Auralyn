import type { CognitiveDisposition } from "./dispositionEngine";
import type { ClinicalStrategy } from "./strategyEngine";

export interface PatientMessage {
  headline:      string;
  body:          string;
  returnPrecautions: string[];
  urgency:       "routine" | "prompt" | "immediate";
}

const RETURN_PRECAUTIONS = [
  "Worsening shortness of breath",
  "Chest pain or pressure",
  "High fever (> 103°F / 39.4°C)",
  "Confusion or altered mental status",
  "Inability to keep fluids down",
  "Symptoms not improving within 48 hours",
];

export function generatePatientMessage(result: {
  disposition: CognitiveDisposition;
  strategy:    ClinicalStrategy;
  diagnosis?:  string;
}): PatientMessage {
  switch (result.disposition) {
    case "HOME":
      return {
        headline: "Your visit is complete — home care recommended",
        body:     `Based on your symptoms and evaluation, your presentation is most consistent with ${result.diagnosis ?? "a self-limited illness"}. We recommend rest, fluids, and over-the-counter symptom management. No emergency intervention is required at this time.`,
        returnPrecautions: RETURN_PRECAUTIONS,
        urgency: "routine",
      };

    case "FOLLOW_UP":
      return {
        headline: "Follow-up appointment recommended within 24–48 hours",
        body:     `While your condition does not appear immediately dangerous, some diagnostic uncertainty remains. Please schedule a follow-up visit with your primary care provider within the next 24–48 hours. If symptoms worsen before your appointment, seek care promptly.`,
        returnPrecautions: RETURN_PRECAUTIONS,
        urgency: "prompt",
      };

    case "URGENT_CARE":
      return {
        headline: "In-person urgent care evaluation needed today",
        body:     `Given some uncertainty in your clinical picture, we recommend you be evaluated in-person at an urgent care or emergency department today. Further diagnostic testing may be required to rule out serious conditions.`,
        returnPrecautions: RETURN_PRECAUTIONS,
        urgency: "prompt",
      };

    case "ED":
      return {
        headline: "IMMEDIATE emergency department evaluation required",
        body:     "Your symptoms indicate a potentially serious or life-threatening condition. Please go to the nearest emergency department immediately or call 911. Do not drive yourself.",
        returnPrecautions: [],
        urgency: "immediate",
      };
  }
}
