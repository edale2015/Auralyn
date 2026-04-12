export interface DebateInput {
  centorScore: number;
  strepProbability: number;
}

export interface DebateInputV2 {
  centorScore:  number;
  probability:  number;
}

export interface DebateOutputV2 {
  decision:      string;
  confidence:    "HIGH" | "MEDIUM" | "LOW";
  proArguments:  string[];
  conArguments:  string[];
  summary:       string;
}

export interface DebateResult {
  decision: "ANTIBIOTIC_GIVEN" | "NO_ANTIBIOTIC_OR_DELAYED";
  reasoning: string[];
  proArguments: string[];
  conArguments: string[];
  confidence: number;
}

export function runAntibioticDebate(input: DebateInput): DebateResult {
  const pro: string[] = [];
  const con: string[] = [];

  if (input.centorScore >= 4)        pro.push("High Centor score supports antibiotics");
  if (input.centorScore === 3)       pro.push("Centor score 3 suggests possible benefit");
  if (input.strepProbability > 0.6)  pro.push("High probability of bacterial infection");
  if (input.strepProbability > 0.35) pro.push("Moderate probability warrants consideration");

  if (input.centorScore <= 2)        con.push("Low Centor score argues against antibiotics");
  if (input.centorScore <= 1)        con.push("Very low Centor score: antibiotic use not supported");
  if (input.strepProbability < 0.3)  con.push("Low bacterial probability");
  if (input.strepProbability < 0.15) con.push("Very low bacterial probability: treat supportively");

  const confidence = Math.abs(pro.length - con.length) / Math.max(1, pro.length + con.length);

  const decision: DebateResult["decision"] = pro.length > con.length
    ? "ANTIBIOTIC_GIVEN"
    : "NO_ANTIBIOTIC_OR_DELAYED";

  return {
    decision,
    reasoning: decision === "ANTIBIOTIC_GIVEN" ? pro : con,
    proArguments: pro,
    conArguments: con,
    confidence,
  };
}

export function runAntibioticDebateV2(input: DebateInputV2): DebateOutputV2 {
  const pro: string[] = [];
  const con: string[] = [];

  let proWeight = 0;
  let conWeight = 0;

  if (input.centorScore >= 4) { pro.push("High Centor score"); proWeight += 2; }
  if (input.centorScore === 3) { pro.push("Centor score 3 — possible benefit"); proWeight += 1; }
  if (input.probability > 0.65) { pro.push("High bacterial probability"); proWeight += 2; }
  if (input.probability > 0.4) { pro.push("Intermediate-high probability"); proWeight += 1; }

  if (input.centorScore <= 2) { con.push("Low Centor score"); conWeight += 2; }
  if (input.centorScore <= 1) { con.push("Very low Centor score"); conWeight += 1; }
  if (input.probability < 0.3) { con.push("Low bacterial probability"); conWeight += 2; }
  if (input.probability < 0.15) { con.push("Very low bacterial probability"); conWeight += 1; }

  let decision = "NO_ANTIBIOTIC";
  if (proWeight > conWeight) decision = "ANTIBIOTIC";
  else if (proWeight === conWeight && proWeight > 0) decision = "TEST_OR_DELAYED";

  const delta = Math.abs(proWeight - conWeight);
  const confidence: DebateOutputV2["confidence"] =
    delta >= 3 ? "HIGH" : delta >= 1 ? "MEDIUM" : "LOW";

  return {
    decision,
    confidence,
    proArguments: pro,
    conArguments: con,
    summary: `Pro: ${pro.join(", ") || "none"} | Con: ${con.join(", ") || "none"}`,
  };
}
