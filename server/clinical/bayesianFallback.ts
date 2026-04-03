import { BayesianCandidate } from "../db/sharedTypes";

export interface BayesianFallbackResult {
  top: BayesianCandidate | null;
  mode: "single_diagnosis" | "uncertain_differential";
  differential: BayesianCandidate[];
  physicianReviewPriority: "routine" | "urgent";
  uncertaintyNote?: string;
}

export function applyPosteriorFallback(
  differential: BayesianCandidate[],
  threshold = 0.40
): BayesianFallbackResult {
  const ranked = [...differential].sort((a, b) => b.posterior - a.posterior);
  const top = ranked[0] ?? null;

  if (!top) {
    return {
      top: null,
      mode: "uncertain_differential",
      differential: [],
      physicianReviewPriority: "urgent",
      uncertaintyNote:
        "No diagnosis could be confidently distinguished from the differential. Physician review required.",
    };
  }

  if (top.posterior < threshold) {
    return {
      top,
      mode: "uncertain_differential",
      differential: ranked.slice(0, 5),
      physicianReviewPriority: "urgent",
      uncertaintyNote:
        `Highest posterior (${top.posterior.toFixed(2)}) is below confidence threshold (${threshold.toFixed(2)}). ` +
        `Differential presented with explicit uncertainty — deterministic rule fallback is primary output. ` +
        `Physician review priority elevated.`,
    };
  }

  return {
    top,
    mode: "single_diagnosis",
    differential: ranked.slice(0, 5),
    physicianReviewPriority: "routine",
  };
}
