export type CouncilName = "cardiology" | "infectious_disease" | "icu" | "master";

export interface PatientContext {
  patientId: string;
  age?: number;
  complaint?: string;
  symptoms?: string[];
  riskFactors?: string[];
  history?: string[];
  allergies?: string[];
  vitals?: {
    hr?: number;
    rr?: number;
    spo2?: number;
    temp?: number;
    systolic?: number;
    diastolic?: number;
  };
  labs?: {
    troponin?: number;
    lactate?: number;
    wbc?: number;
    creatinine?: number;
    procalcitonin?: number;
  };
  exam?: {
    alteredMentalStatus?: boolean;
    chestPain?: boolean;
    dyspnea?: boolean;
    cough?: boolean;
    flankPain?: boolean;
    dysuria?: boolean;
    rigors?: boolean;
  };
  tests?: {
    ecgStElevation?: boolean;
    infiltrateOnCxr?: boolean;
    bloodCulturePositive?: boolean;
    urineNitritePositive?: boolean;
  };
}

export interface AgentInput {
  traceId: string;
  council: CouncilName;
  patient: PatientContext;
  features?: number[];
  sequence?: number[][];
  mode?: "balanced" | "fast-safe" | "deep-think";
}

export interface AgentOutput {
  council: CouncilName;
  agent: string;
  confidence: number;
  result: Record<string, unknown>;
  reasoning: string;
  flags?: string[];
}

export interface DebateMessage {
  from: string;
  to: string;
  critique: string;
  scoreAdjustment: number;
}

export interface ConsensusResult {
  risk: number;
  urgency: "routine" | "expedited" | "urgent" | "critical";
  confidence: number;
  disagreement: number;
  recommendation?: string;
  recommendedTests?: string[];
  flags?: string[];
}

export interface CouncilRunResult {
  council: CouncilName;
  outputs: AgentOutput[];
  debate: DebateMessage[];
  consensus: ConsensusResult;
  reasoningPaths: {
    path: string[];
    score: number;
    riskAccum: number;
  }[];
  finalDecision: Record<string, unknown>;
}
