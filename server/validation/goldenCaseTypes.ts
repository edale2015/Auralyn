/**
 * Type definitions for the golden-case validation harness.
 *
 * A GoldenCase is a known clinical scenario with a ground-truth
 * disposition and optional expected top-diagnosis.  The harness
 * runs each case through the live engine and asserts correctness.
 */

export type Disposition =
  | "home"
  | "urgent_care"
  | "physician_review_required"
  | "ed"
  | "call_911";

export type GoldenCaseObservation = {
  feature: string;
  value:   boolean | string | number;
  weight?: number;
};

export type PresentationProfile = {
  complaint:                    string;
  requiredFeaturesAnyOf:        string[];
  stronglyExpectedFeaturesAnyOf?: string[];
};

export type GoldenCase = {
  id:                   string;
  complaint:            string;
  title:                string;
  observations:         GoldenCaseObservation[];
  presentationProfile:  PresentationProfile;
  expectedTopDiagnosis?: string;
  expectedDisposition:  Disposition;
  minimumSafeDisposition?: Disposition;
  redFlagCount?:        number;
  notes?:               string;
};

export type ValidationRunResult = {
  caseId:               string;
  pass:                 boolean;
  topDiagnosis?:        string;
  finalDisposition:     string;
  expectedDisposition:  string;
  expectedTopDiagnosis?: string;
  diagnosisMatch:       boolean;
  dispositionMatch:     boolean;
  unsafeUndercall:      boolean;
  reasons:              string[];
};

export type ValidationSummary = {
  total:             number;
  passed:            number;
  failed:            number;
  passRate:          number;
  unsafeUndercalls:  number;
  diagnosisMisses:   number;
  dispositionMisses: number;
  calibrationError?: number;
};
