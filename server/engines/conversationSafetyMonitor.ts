export interface SafetyAnalysis {
  risk: boolean;
  riskLevel: "none" | "low" | "moderate" | "high";
  detectedIndicators: string[];
  recommendedTone: string;
  recommendedAction?: string;
}

const RISK_PATTERNS: Array<{ pattern: string; level: "low" | "moderate" | "high"; indicator: string }> = [
  { pattern: "confused", level: "moderate", indicator: "confusion" },
  { pattern: "scared", level: "moderate", indicator: "fear" },
  { pattern: "panic", level: "high", indicator: "panic" },
  { pattern: "dont understand", level: "low", indicator: "comprehension_difficulty" },
  { pattern: "don't understand", level: "low", indicator: "comprehension_difficulty" },
  { pattern: "can't breathe", level: "high", indicator: "acute_distress" },
  { pattern: "cant breathe", level: "high", indicator: "acute_distress" },
  { pattern: "dying", level: "high", indicator: "crisis_language" },
  { pattern: "help me", level: "moderate", indicator: "distress_plea" },
  { pattern: "emergency", level: "moderate", indicator: "emergency_mention" },
  { pattern: "chest pain", level: "moderate", indicator: "chest_pain_mention" },
  { pattern: "suicidal", level: "high", indicator: "mental_health_crisis" },
  { pattern: "kill myself", level: "high", indicator: "mental_health_crisis" },
];

const TONE_MAP: Record<string, string> = {
  none: "neutral",
  low: "supportive",
  moderate: "reassuring",
  high: "calm_urgent",
};

export function analyzeConversation(message: string): SafetyAnalysis {
  const lower = message.toLowerCase();
  const detected: Array<{ level: string; indicator: string }> = [];

  RISK_PATTERNS.forEach(({ pattern, level, indicator }) => {
    if (lower.includes(pattern)) {
      detected.push({ level, indicator });
    }
  });

  if (detected.length === 0) {
    return { risk: false, riskLevel: "none", detectedIndicators: [], recommendedTone: "neutral" };
  }

  const levelOrder = { low: 1, moderate: 2, high: 3 };
  const maxLevel = detected.reduce((max, d) => {
    return (levelOrder[d.level as keyof typeof levelOrder] ?? 0) > (levelOrder[max as keyof typeof levelOrder] ?? 0) ? d.level : max;
  }, "low") as "low" | "moderate" | "high";

  const hasCrisis = detected.some(d => d.indicator === "mental_health_crisis");

  return {
    risk: true,
    riskLevel: maxLevel,
    detectedIndicators: detected.map(d => d.indicator),
    recommendedTone: TONE_MAP[maxLevel] ?? "reassuring",
    recommendedAction: hasCrisis ? "immediate_human_escalation" : undefined,
  };
}
