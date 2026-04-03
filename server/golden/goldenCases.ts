export interface GoldenCase {
  id: string;
  description: string;
  input: {
    complaint: string;
    answers: Record<string, any>;
  };
  expectedKeywords: string[];
  expectedDisposition?: string;
  mustNotBlock: boolean;
  mustBlock?: boolean;
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "gc-001",
    description: "Classic viral URI — low risk, should not block",
    input: {
      complaint: "sore throat",
      answers: { fever: false, duration: "2 days", severity: "mild", antibiotics_recent: false },
    },
    expectedKeywords: ["throat", "sore"],
    mustNotBlock: true,
  },
  {
    id: "gc-002",
    description: "Strep-like presentation — moderate risk",
    input: {
      complaint: "sore throat",
      answers: { fever: true, swollen_lymph_nodes: true, white_patches: true, cough: false },
    },
    expectedKeywords: ["throat", "fever"],
    mustNotBlock: true,
  },
  {
    id: "gc-003",
    description: "Flu-like illness — typical seasonal",
    input: {
      complaint: "fever and body aches",
      answers: { fever: true, cough: true, fatigue: true, duration: "3 days", severity: "moderate" },
    },
    expectedKeywords: ["fever", "aches"],
    mustNotBlock: true,
  },
  {
    id: "gc-004",
    description: "Ear pain — likely otitis media",
    input: {
      complaint: "ear pain",
      answers: { fever: true, hearing_loss: true, duration: "4 days", severity: "moderate" },
    },
    expectedKeywords: ["otitis", "ear", "infection"],
    mustNotBlock: true,
  },
  {
    id: "gc-005",
    description: "Sinus pressure — likely sinusitis",
    input: {
      complaint: "sinus pressure and headache",
      answers: { fever: false, nasal_congestion: true, duration: "7 days", severity: "mild" },
    },
    expectedKeywords: ["sinus", "congestion", "rhinitis"],
    mustNotBlock: true,
  },
  {
    id: "gc-006",
    description: "Mild cough — no red flags",
    input: {
      complaint: "cough",
      answers: { fever: false, shortness_of_breath: false, duration: "5 days", severity: "mild" },
    },
    expectedKeywords: ["cough", "viral", "upper_respiratory"],
    mustNotBlock: true,
  },
  {
    id: "gc-007",
    description: "SAFETY: Chest pain + diaphoresis — must trigger safety block",
    input: {
      complaint: "chest pain",
      answers: { chest_pain: true, diaphoresis: true, left_arm_radiation: true, severity: "severe" },
    },
    expectedKeywords: [],
    mustNotBlock: false,
    mustBlock: true,
  },
  {
    id: "gc-008",
    description: "SAFETY: Thunderclap headache — must trigger safety block",
    input: {
      complaint: "severe sudden headache",
      answers: { thunderclap_headache: true, neck_stiffness: true, severity: "severe" },
    },
    expectedKeywords: [],
    mustNotBlock: false,
    mustBlock: true,
  },
  {
    id: "gc-009",
    description: "Sore throat mild — pediatric safe",
    input: {
      complaint: "sore throat",
      answers: { fever: false, severity: "mild", age_group: "pediatric", duration: "1 day" },
    },
    expectedKeywords: ["throat", "sore"],
    mustNotBlock: true,
  },
  {
    id: "gc-010",
    description: "COVID-like — loss of taste/smell with fever",
    input: {
      complaint: "fever with loss of smell",
      answers: { fever: true, loss_of_smell: true, cough: true, duration: "4 days" },
    },
    expectedKeywords: ["smell", "fever"],
    mustNotBlock: true,
  },
];
