import type { CaseRecord } from "../types/case";
import { returnPrecautionsKey } from "../ontology/ontologyFieldMapper";

export interface DispositionExplanation {
  headline: string;
  body: string;
  urgency: "low" | "moderate" | "high";
}

// Canonical key resolution via returnPrecautionsKey(disposition) from ontologyFieldMapper

function buildDispositionBase(
  disposition: string,
): { headline: string; body: string; urgency: DispositionExplanation["urgency"] } | null {
  switch (disposition) {
    case "er_send":
      return {
        headline: "Urgent Evaluation Recommended",
        body:     "Based on your symptoms, we recommend you seek emergency or urgent evaluation as soon as possible. A clinician is reviewing your case.",
        urgency:  "high",
      };
    case "urgent_care":
      return {
        headline: "Prompt Care Recommended",
        body:     "Your symptoms suggest you should be seen at an urgent care or by your provider soon. A clinician is reviewing your case.",
        urgency:  "moderate",
      };
    case "routine_urgent":
      return {
        headline: "Follow-Up Recommended Soon",
        body:     "We recommend following up with your provider within the next day or two. A clinician is reviewing your case.",
        urgency:  "moderate",
      };
    case "routine":
      return {
        headline: "Routine Follow-Up Recommended",
        body:     "Your symptoms appear manageable. A clinician is reviewing your case and will provide guidance.",
        urgency:  "low",
      };
    case "pcp":
      return {
        headline: "Primary Care Follow-Up",
        body:     "We recommend scheduling a visit with your primary care provider. A clinician is reviewing your case.",
        urgency:  "low",
      };
    case "self_care":
      return {
        headline: "Self-Care Guidance Available",
        body:     "Your symptoms may be manageable at home with self-care. A clinician is reviewing your case and will confirm.",
        urgency:  "low",
      };
    default:
      return null;
  }
}

const STATUS_MAP: Record<string, { headline: string; body: string; urgency: DispositionExplanation["urgency"] }> = {
  INTAKE_IN_PROGRESS: {
    headline: "Intake In Progress",
    body:     "Please continue answering the remaining questions so we can complete your assessment.",
    urgency:  "low",
  },
  AWAITING_REVIEW: {
    headline: "Awaiting Clinician Review",
    body:     "Your intake is complete. A clinician will review your case shortly.",
    urgency:  "low",
  },
  IN_REVIEW: {
    headline: "Under Clinician Review",
    body:     "A clinician is currently reviewing your information.",
    urgency:  "low",
  },
  SIGNED_OFF: {
    headline: "Review Complete",
    body:     "A clinician has reviewed your case. Please follow the provided recommendations.",
    urgency:  "low",
  },
};

export function buildChatDispositionExplanation(caseRecord: CaseRecord): DispositionExplanation {
  const disposition = caseRecord.engineResult?.recommendedDisposition?.toLowerCase();
  const status      = caseRecord.status;

  if (disposition && returnPrecautionsKey(disposition)) {
    const base = buildDispositionBase(disposition);
    if (base) {
      if (status === "SIGNED_OFF") {
        return {
          headline: base.headline,
          body:     base.body.replace(
            "A clinician is reviewing your case.",
            "Your clinician has reviewed and confirmed this assessment.",
          ),
          urgency: base.urgency,
        };
      }
      return base;
    }
  }

  if (status && STATUS_MAP[status]) {
    return STATUS_MAP[status];
  }

  return {
    headline: "Assessment Pending",
    body:     "Your case is being processed. A clinician will review your information.",
    urgency:  "low",
  };
}
