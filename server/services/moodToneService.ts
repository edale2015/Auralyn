export type MoodLabel = "calm" | "concerned" | "distressed" | "urgent" | "unknown";
export type ToneLabel = "empathetic" | "clinical" | "directive" | "neutral";

export interface MoodAnalysis {
  mood: MoodLabel;
  score: number;
  tone: ToneLabel;
  flags: string[];
}

const URGENT_PATTERNS = [
  /\b(911|emergency|dying|can't breathe|cannot breathe|chest pain|stroke|seizure|unconscious|unresponsive|heart attack|bleeding heavily|overdose)\b/i,
];

const DISTRESSED_PATTERNS = [
  /\b(scared|terrified|panicking|crying|awful|horrible|unbearable|excruciating|worst|help me|please help|desperate|agony)\b/i,
  /\b(severe|extreme|intense|can't stand|cannot stand|killing me)\b/i,
];

const CONCERNED_PATTERNS = [
  /\b(worried|anxious|nervous|concerned|unsure|don't know|not sure|confused|maybe|could be|might be)\b/i,
  /\b(hurts|painful|aching|burning|swollen|fever|dizzy|nauseous|vomiting)\b/i,
];

const CALM_PATTERNS = [
  /\b(okay|fine|mild|slight|little|minor|not too bad|manageable|okay-ish|feeling okay)\b/i,
];

export function analyzeMood(text: string): MoodAnalysis {
  const flags: string[] = [];

  for (const p of URGENT_PATTERNS) {
    if (p.test(text)) {
      flags.push("urgent_keyword");
      return { mood: "urgent", score: 1.0, tone: "directive", flags };
    }
  }

  let distressScore = 0;
  for (const p of DISTRESSED_PATTERNS) {
    if (p.test(text)) {
      distressScore += 0.5;
      flags.push("distress_keyword");
    }
  }
  if (distressScore >= 0.5) {
    return { mood: "distressed", score: Math.min(distressScore, 0.95), tone: "empathetic", flags };
  }

  let concernScore = 0;
  for (const p of CONCERNED_PATTERNS) {
    if (p.test(text)) {
      concernScore += 0.35;
      flags.push("concern_keyword");
    }
  }
  if (concernScore >= 0.35) {
    return { mood: "concerned", score: Math.min(concernScore, 0.7), tone: "clinical", flags };
  }

  for (const p of CALM_PATTERNS) {
    if (p.test(text)) {
      return { mood: "calm", score: 0.1, tone: "neutral", flags };
    }
  }

  if (text.trim().length < 8) {
    return { mood: "unknown", score: 0, tone: "neutral", flags };
  }

  return { mood: "calm", score: 0.15, tone: "neutral", flags };
}

export function buildTonePrefix(mood: MoodLabel): string {
  switch (mood) {
    case "urgent":
      return "⚠️ This sounds serious. ";
    case "distressed":
      return "I hear you, and I want to help. ";
    case "concerned":
      return "Understood. ";
    case "calm":
    default:
      return "";
  }
}
