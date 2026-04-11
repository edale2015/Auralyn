export interface DebateInput {
  centorScore: number;
  strepProbability: number;
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
