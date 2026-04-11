export interface CentorInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderAnteriorCervicalNodes: boolean;
  absenceOfCough: boolean;
  age: number;
}

export type CentorDecision =
  | "NO_ANTIBIOTIC"
  | "TEST_OR_DELAYED_RX"
  | "EMPIRIC_ANTIBIOTIC"
  | "UNKNOWN";

export function calculateCentorScore(input: CentorInput): number {
  let score = 0;

  if (input.fever)                        score++;
  if (input.tonsillarExudate)             score++;
  if (input.tenderAnteriorCervicalNodes)  score++;
  if (input.absenceOfCough)               score++;

  if (input.age < 15)  score++;
  if (input.age > 44)  score--;

  return score;
}

export function centorDecision(score: number): CentorDecision {
  if (score <= 1)  return "NO_ANTIBIOTIC";
  if (score === 2 || score === 3) return "TEST_OR_DELAYED_RX";
  if (score >= 4)  return "EMPIRIC_ANTIBIOTIC";
  return "UNKNOWN";
}

export function centorRationale(score: number): string[] {
  const d = centorDecision(score);
  switch (d) {
    case "NO_ANTIBIOTIC":
      return ["Score ≤1: very low probability of strep. No antibiotic indicated."];
    case "TEST_OR_DELAYED_RX":
      return ["Score 2-3: intermediate probability. Rapid antigen test or delayed Rx strategy recommended."];
    case "EMPIRIC_ANTIBIOTIC":
      return ["Score ≥4: high probability of strep. Empiric treatment appropriate."];
    default:
      return ["Score could not be interpreted."];
  }
}
