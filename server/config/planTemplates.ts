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
  // ── Shoulder Pain Templates ──────────────────────────────────────────────
  {
    key: "ortho_shoulder_atraumatic",
    diagnosisLabel: "Atraumatic / chronic shoulder pain — low-risk pattern",
    defaultDisposition: "office_followup",
    summary: "Symptoms fit a rotator cuff impingement or tendinopathy pattern. No neurovascular compromise detected. Physician evaluation within 1–3 days is appropriate.",
    homeCare: [
      "Rest the shoulder — avoid overhead reaching and heavy lifting",
      "Apply ice 15–20 min three times a day for the first 48–72 hours",
      "After 72 hours switch to heat if preferred",
      "Keep the arm at rest in a sling if moving it is very painful",
      "Gentle pendulum exercises if tolerated — let the arm hang and make small circles",
    ],
    meds: [
      { name: "Ibuprofen (Advil / Motrin)", dose: "400–600 mg every 6–8 hours with food", instructions: "Take with food. Do not use if you have kidney disease, ulcers, or are on blood thinners. Max 7 days without physician guidance." },
      { name: "Acetaminophen (Tylenol) — if ibuprofen not tolerated", dose: "500–1000 mg every 6 hours", instructions: "Do not exceed 3 g per day. Check all other medications for acetaminophen content." },
    ],
    followUp: [
      "Schedule with your primary care or orthopedic provider within 3–5 days.",
      "If imaging is ordered and shows a rotator cuff tear, physical therapy referral is first-line.",
      "Corticosteroid injection may be considered by your physician if pain persists > 4–6 weeks.",
    ],
    returnPrecautions: [
      "Sudden loss of pulse or sensation in the hand → CALL 911 IMMEDIATELY",
      "Complete inability to move the arm after a fall → Go to the ER",
      "Fever > 101°F with a hot, swollen, red shoulder → Go to ER (possible septic joint)",
      "Severe worsening pain, numbness spreading down the arm",
      "New weakness or hand dropping",
    ],
    patientMessage: "Based on your answers, this looks like a lower-risk shoulder pain pattern, likely related to the rotator cuff or surrounding muscles. Rest, ice, and over-the-counter anti-inflammatories should help. Please see a provider within the next few days for a full exam. Go to the ER immediately if you lose pulse or sensation in your hand, develop high fever with a swollen shoulder, or have a complete inability to move the arm after a fall.",
  },
  {
    key: "ortho_shoulder_traumatic",
    diagnosisLabel: "Traumatic shoulder injury — possible dislocation or AC injury",
    defaultDisposition: "urgent_care",
    summary: "Mechanism and findings suggest possible dislocation or significant AC joint injury. Imaging is needed.",
    homeCare: [
      "Immobilize the shoulder in a sling — do not attempt to 'pop it back in'",
      "Apply ice wrapped in cloth — 20 minutes on, 20 minutes off",
      "Do not eat or drink anything in case sedation is needed for reduction",
    ],
    meds: [],
    followUp: ["X-ray at minimum. CT may be needed if complex fracture suspected."],
    returnPrecautions: [
      "Any change in pulse or sensation → CALL 911",
      "Open wound with visible bone → CALL 911",
      "Increasing numbness, tingling, or hand weakness",
    ],
    patientMessage: "A significant shoulder injury needs X-ray imaging today to rule out dislocation or fracture. Please go to urgent care or the emergency department. Keep the arm in a sling. Do not try to move the joint. Call 911 immediately if you notice no pulse or feeling in the hand.",
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
