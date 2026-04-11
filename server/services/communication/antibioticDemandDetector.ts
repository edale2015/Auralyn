export interface DemandSignal {
  isDemandingAntibiotic: boolean;
  phrasesMatched: string[];
  confidence: "high" | "medium" | "low";
}

export const ANTIBIOTIC_DEMAND_PHRASES = [
  "zpack",
  "z-pak",
  "z pak",
  "azithromycin",
  "i want antibiotics",
  "just give me antibiotics",
  "i need antibiotics",
  "i know my body",
  "it always turns into",
  "this always becomes",
  "it turns into a sore throat",
  "antibiotics always fix it",
  "antibiotics always work for me",
  "this always needs antibiotics",
  "i've done this before",
  "just give me a prescription",
  "amoxicillin",
  "augmentin",
];

export function detectAntibioticDemand(text: string = ""): DemandSignal {
  const lower = text.toLowerCase();
  const matches = ANTIBIOTIC_DEMAND_PHRASES.filter(p => lower.includes(p));

  let confidence: DemandSignal["confidence"] = "low";
  if (matches.length >= 3) confidence = "high";
  else if (matches.length >= 1) confidence = "medium";

  return {
    isDemandingAntibiotic: matches.length > 0,
    phrasesMatched: matches,
    confidence: matches.length === 0 ? "low" : confidence,
  };
}
