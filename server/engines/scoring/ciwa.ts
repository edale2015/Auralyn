export interface CIWAInput {
  nausea: number;
  tremor: number;
  paroxysmalSweats: number;
  anxiety: number;
  agitation: number;
  tactileDisturbances: number;
  auditoryDisturbances: number;
  visualDisturbances: number;
  headache: number;
  orientation: number;
}

export interface CIWAResult {
  score: number;
  maxScore: number;
  severity: string;
  recommendation: string;
  components: { criterion: string; value: number; maxValue: number }[];
}

export function calculateCIWA(input: CIWAInput): CIWAResult {
  const clamp = (v: number, max: number) => Math.min(Math.max(v || 0, 0), max);

  const components = [
    { criterion: "Nausea/vomiting", value: clamp(input.nausea, 7), maxValue: 7 },
    { criterion: "Tremor", value: clamp(input.tremor, 7), maxValue: 7 },
    { criterion: "Paroxysmal sweats", value: clamp(input.paroxysmalSweats, 7), maxValue: 7 },
    { criterion: "Anxiety", value: clamp(input.anxiety, 7), maxValue: 7 },
    { criterion: "Agitation", value: clamp(input.agitation, 7), maxValue: 7 },
    { criterion: "Tactile disturbances", value: clamp(input.tactileDisturbances, 7), maxValue: 7 },
    { criterion: "Auditory disturbances", value: clamp(input.auditoryDisturbances, 7), maxValue: 7 },
    { criterion: "Visual disturbances", value: clamp(input.visualDisturbances, 7), maxValue: 7 },
    { criterion: "Headache", value: clamp(input.headache, 7), maxValue: 7 },
    { criterion: "Orientation/clouding", value: clamp(input.orientation, 4), maxValue: 4 },
  ];

  const score = components.reduce((s, c) => s + c.value, 0);

  let severity: string;
  let recommendation: string;
  if (score <= 8) {
    severity = "Mild";
    recommendation = "Mild withdrawal — supportive care, reassess every 4 hours";
  } else if (score <= 15) {
    severity = "Moderate";
    recommendation = "Moderate withdrawal — consider benzodiazepine protocol";
  } else if (score <= 20) {
    severity = "Severe";
    recommendation = "Severe withdrawal — aggressive benzodiazepine dosing, close monitoring";
  } else {
    severity = "Very Severe";
    recommendation = "Very severe withdrawal — ICU-level care, high risk of seizures/DT";
  }

  return { score, maxScore: 67, severity, recommendation, components };
}
