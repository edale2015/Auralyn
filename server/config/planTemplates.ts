import { Disposition } from "../../shared/packRows";

export interface PlanTemplate {
  key: string;
  diagnosisLabel: string;
  defaultDisposition: Disposition;
  summary: string;
  homeCare: string[];
  meds: Array<{
    name: string;
    dose: string;
    instructions: string;
  }>;
  followUp: string[];
  returnPrecautions: string[];
  patientMessage: string;
}

export const planTemplates: PlanTemplate[] = [
  {
    key: "pulm_cough",
    diagnosisLabel: "Likely uncomplicated cough / viral URI pattern",
    defaultDisposition: "self_care",
    summary: "Symptoms fit a low-risk cough pattern unless breathing trouble, chest pain, or blood is present.",
    homeCare: ["Hydration", "Rest", "Honey if age appropriate", "Humidified air"],
    meds: [],
    followUp: ["Follow up if not improving over several days."],
    returnPrecautions: ["Shortness of breath", "Chest pain", "Coughing blood", "Worsening fever"],
    patientMessage: "Your symptoms appear to fit a lower-risk cough pattern from the current information. Seek urgent care if breathing trouble, chest pain, or worsening symptoms develop.",
  },
  {
    key: "ortho_back_pain",
    diagnosisLabel: "Likely uncomplicated back pain pattern",
    defaultDisposition: "self_care",
    summary: "This pattern can often be managed conservatively if there is no weakness, bowel/bladder change, groin numbness, or fever.",
    homeCare: ["Relative activity", "Heat or ice", "Avoid heavy lifting temporarily"],
    meds: [],
    followUp: ["Follow up if symptoms persist or worsen."],
    returnPrecautions: ["Leg weakness", "Groin numbness", "Loss of bowel or bladder control", "Fever"],
    patientMessage: "Your answers suggest a lower-risk back pain pattern at this time, but urgent evaluation is needed if weakness, numbness in the groin, or bowel/bladder symptoms develop.",
  },
  {
    key: "card_chest_pain",
    diagnosisLabel: "Potential high-risk chest pain",
    defaultDisposition: "er_now",
    summary: "Chest pain can represent a serious emergency depending on associated symptoms.",
    homeCare: [],
    meds: [],
    followUp: ["Emergency evaluation now."],
    returnPrecautions: ["Do not delay if symptoms continue or worsen."],
    patientMessage: "Your symptoms may represent a serious medical problem. Please go to the emergency room now.",
  },
];
