export interface GCSInput {
  eye: number;
  verbal: number;
  motor: number;
}

export interface GCSResult {
  score: number;
  maxScore: number;
  severity: string;
  recommendation: string;
  components: { criterion: string; value: number; maxValue: number }[];
}

export function calculateGCS(input: GCSInput): GCSResult {
  const eye = Math.min(Math.max(input.eye || 1, 1), 4);
  const verbal = Math.min(Math.max(input.verbal || 1, 1), 5);
  const motor = Math.min(Math.max(input.motor || 1, 1), 6);

  const components = [
    { criterion: "Eye opening (E)", value: eye, maxValue: 4 },
    { criterion: "Verbal response (V)", value: verbal, maxValue: 5 },
    { criterion: "Motor response (M)", value: motor, maxValue: 6 },
  ];

  const score = eye + verbal + motor;

  let severity: string;
  let recommendation: string;
  if (score <= 8) {
    severity = "Severe";
    recommendation = "Severe brain injury — intubation and ICU management indicated";
  } else if (score <= 12) {
    severity = "Moderate";
    recommendation = "Moderate brain injury — close monitoring, consider CT head";
  } else {
    severity = "Mild";
    recommendation = "Mild injury — observation, reassess in 4-6 hours";
  }

  return { score, maxScore: 15, severity, recommendation, components };
}
