export type Disposition = "self_care" | "office_followup" | "telemed_now" | "urgent_care" | "er_now";

export interface TreatmentPlan {
  summary: string;
  diagnosisLabel: string;
  meds: Array<{ name: string; dose: string; instructions: string }>;
  homeCare: string[];
  followUp: string[];
  returnPrecautions: string[];
  patientMessage: string;
}

export interface AutoPlanResult {
  proposedDisposition: Disposition;
  differential: Array<{ diagnosis: string; probability: number }>;
  proposedPlan: TreatmentPlan | null;
  reviewReason?: string;
}

export function generateAutoPlan(input: { chiefComplaint?: string; redFlags?: string[] }): AutoPlanResult {
  const cc = (input.chiefComplaint || "").toLowerCase();
  const redFlags = input.redFlags || [];

  if (redFlags.length > 0) {
    return {
      proposedDisposition: "er_now",
      differential: [{ diagnosis: "red_flag_condition", probability: 0.95 }],
      proposedPlan: {
        summary: "Red flag symptoms require immediate emergency evaluation.",
        diagnosisLabel: "Possible emergency condition",
        meds: [],
        homeCare: [],
        followUp: ["Go to the ER now or call emergency services if symptoms are severe."],
        returnPrecautions: ["Do not wait if symptoms worsen."],
        patientMessage: "Your symptoms may indicate an urgent problem. Please go to the emergency room now.",
      },
      reviewReason: "red_flags_detected",
    };
  }

  if (cc === "cough") {
    return {
      proposedDisposition: "self_care",
      differential: [
        { diagnosis: "viral_uri", probability: 0.82 },
        { diagnosis: "post_nasal_drainage", probability: 0.11 },
        { diagnosis: "bronchitis", probability: 0.07 },
      ],
      proposedPlan: {
        summary: "Likely viral upper respiratory infection without clear emergency features.",
        diagnosisLabel: "Viral upper respiratory infection",
        meds: [{ name: "Acetaminophen", dose: "per label dosing", instructions: "Use for fever or discomfort if needed." }],
        homeCare: ["Hydration", "Rest", "Honey if age appropriate", "Humidified air"],
        followUp: ["Follow up if not improving over several days."],
        returnPrecautions: ["Trouble breathing", "Persistent chest pain", "Dehydration", "High fever"],
        patientMessage: "Your symptoms most likely fit a viral upper respiratory infection. Supportive care is recommended, and you should seek urgent evaluation if breathing trouble, chest pain, or worsening symptoms develop.",
      },
    };
  }

  if (cc === "urinary burning") {
    return {
      proposedDisposition: "telemed_now",
      differential: [
        { diagnosis: "acute_simple_cystitis", probability: 0.84 },
        { diagnosis: "pyelonephritis", probability: 0.08 },
        { diagnosis: "vaginitis", probability: 0.08 },
      ],
      proposedPlan: {
        summary: "Symptoms may fit uncomplicated cystitis if no fever, flank pain, or pregnancy risk.",
        diagnosisLabel: "Possible uncomplicated UTI",
        meds: [{ name: "Nitrofurantoin", dose: "100 mg", instructions: "Twice daily for 5 days if physician confirms appropriateness." }],
        homeCare: ["Hydration", "Avoid bladder irritants temporarily"],
        followUp: ["Reassess if not improved in 48 hours."],
        returnPrecautions: ["Fever", "Back pain", "Vomiting", "Pregnancy concern"],
        patientMessage: "Your symptoms may fit a bladder infection. A clinician will confirm whether treatment is appropriate and make sure there are no higher-risk signs.",
      },
      reviewReason: "medication_review_required",
    };
  }

  if (cc === "rash") {
    return {
      proposedDisposition: "office_followup",
      differential: [
        { diagnosis: "contact_dermatitis", probability: 0.5 },
        { diagnosis: "viral_exanthem", probability: 0.25 },
        { diagnosis: "eczema", probability: 0.25 },
      ],
      proposedPlan: {
        summary: "Non-emergent rash pattern without obvious red flags based on available data.",
        diagnosisLabel: "Likely non-emergent rash",
        meds: [],
        homeCare: ["Avoid new skin products", "Gentle moisturizer", "Avoid scratching"],
        followUp: ["Review images or schedule follow-up if persistent."],
        returnPrecautions: ["Mouth sores", "Breathing difficulty", "Rapid spread", "Severe pain"],
        patientMessage: "The rash does not appear to show immediate danger from the current information, but it should be reviewed if it spreads, becomes painful, or is associated with swelling or breathing problems.",
      },
    };
  }

  if (cc === "refill") {
    return {
      proposedDisposition: "office_followup",
      differential: [{ diagnosis: "medication_refill_request", probability: 0.98 }],
      proposedPlan: {
        summary: "Medication refill request routed for clinician review.",
        diagnosisLabel: "Refill request",
        meds: [],
        homeCare: [],
        followUp: ["Medication list and pharmacy will be verified."],
        returnPrecautions: [],
        patientMessage: "Your refill request has been received and is being reviewed.",
      },
    };
  }

  if (cc === "sore throat") {
    return {
      proposedDisposition: "telemed_now",
      differential: [
        { diagnosis: "viral_pharyngitis", probability: 0.65 },
        { diagnosis: "streptococcal_pharyngitis", probability: 0.25 },
        { diagnosis: "peritonsillar_abscess", probability: 0.1 },
      ],
      proposedPlan: {
        summary: "Sore throat requiring clinician evaluation for possible strep testing.",
        diagnosisLabel: "Pharyngitis - undifferentiated",
        meds: [{ name: "Ibuprofen", dose: "per label", instructions: "For pain and inflammation as needed." }],
        homeCare: ["Warm fluids", "Salt water gargling", "Rest"],
        followUp: ["Strep test recommended if symptoms persist beyond 48 hours."],
        returnPrecautions: ["Difficulty swallowing", "Drooling", "Neck swelling", "High fever"],
        patientMessage: "Your sore throat should be evaluated. If symptoms persist or worsen, a strep test may be needed.",
      },
      reviewReason: "medication_review_required",
    };
  }

  return {
    proposedDisposition: "telemed_now",
    differential: [{ diagnosis: "undifferentiated_complaint", probability: 0.5 }],
    proposedPlan: null,
    reviewReason: "unsupported_complaint_pathway",
  };
}
