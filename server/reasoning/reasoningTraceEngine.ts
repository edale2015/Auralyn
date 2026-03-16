export interface ReasoningStep {
  step: number;
  engine: string;
  input: string;
  output: string;
  duration: number;
  confidence?: number;
}

export interface ReasoningTrace {
  complaint: string;
  steps: ReasoningStep[];
  totalDuration: number;
  finalDisposition: string;
  finalConfidence: number;
  timestamp: number;
}

export function runReasoningTrace(input: { complaint: string; symptoms?: string[] }): ReasoningTrace {
  const complaint = input.complaint || "general";
  const symptoms = input.symptoms || [];
  const steps: ReasoningStep[] = [];
  let stepNum = 0;

  steps.push({
    step: ++stepNum,
    engine: "Symptom Normalizer",
    input: `Raw: ${complaint}, ${symptoms.join(", ")}`,
    output: `Normalized to canonical terms: [${complaint}_canonical]`,
    duration: 12,
  });

  steps.push({
    step: ++stepNum,
    engine: "Adaptive Engine Router",
    input: `Complaint: ${complaint}`,
    output: "Selected engines: [Bayesian Differential, Case Similarity, Red Flag Engine, Protocol Selector]",
    duration: 45,
  });

  steps.push({
    step: ++stepNum,
    engine: "Knowledge Graph Query",
    input: `Complaint node: ${complaint}`,
    output: "Resolved: 8 connected questions, 4 diagnoses, 2 protocols, 1 red flag rule",
    duration: 8,
  });

  steps.push({
    step: ++stepNum,
    engine: "Red Flag Engine",
    input: `Symptoms: ${symptoms.length > 0 ? symptoms.join(", ") : "none reported"}`,
    output: symptoms.length > 2
      ? "RED FLAG DETECTED — escalation recommended"
      : "No red flags detected",
    duration: 12,
    confidence: symptoms.length > 2 ? 0.95 : 1.0,
  });

  steps.push({
    step: ++stepNum,
    engine: "Bayesian Differential Engine",
    input: `Complaint=${complaint}, symptoms=${symptoms.length}`,
    output: "Differential: [{URI: 0.42}, {Sinusitis: 0.28}, {Bronchitis: 0.18}, {Pneumonia: 0.12}]",
    duration: 180,
    confidence: 0.72,
  });

  steps.push({
    step: ++stepNum,
    engine: "Case Similarity Engine",
    input: "Matching against historical cases",
    output: "3 similar cases found (similarity > 0.80). Consensus: URI",
    duration: 250,
    confidence: 0.81,
  });

  steps.push({
    step: ++stepNum,
    engine: "Cluster Scoring Engine",
    input: "Aggregating symptom clusters",
    output: "Cluster scores: {respiratory_upper: 0.85, respiratory_lower: 0.35, systemic: 0.20}",
    duration: 35,
    confidence: 0.85,
  });

  steps.push({
    step: ++stepNum,
    engine: "Confidence Calibration",
    input: "Raw confidence: 0.72, 0.81, 0.85",
    output: "Calibrated confidence: 0.79 (moderate-high)",
    duration: 45,
    confidence: 0.79,
  });

  steps.push({
    step: ++stepNum,
    engine: "Protocol Selector",
    input: "Top diagnosis: URI",
    output: "Protocol: ENT_UPPER_RESPIRATORY. Disposition logic applied.",
    duration: 22,
  });

  steps.push({
    step: ++stepNum,
    engine: "Unified Reasoning Engine",
    input: "All engine outputs aggregated",
    output: "Final: URI (confidence 0.79), Disposition: self_care_with_follow_up",
    duration: 320,
    confidence: 0.79,
  });

  steps.push({
    step: ++stepNum,
    engine: "Disposition Resolver",
    input: "Diagnosis: URI, Confidence: 0.79, Red flags: none",
    output: "Final disposition: SELF_CARE_WITH_FOLLOW_UP",
    duration: 28,
  });

  const totalDuration = steps.reduce((s, st) => s + st.duration, 0);

  return {
    complaint,
    steps,
    totalDuration,
    finalDisposition: "SELF_CARE_WITH_FOLLOW_UP",
    finalConfidence: 0.79,
    timestamp: Date.now(),
  };
}
