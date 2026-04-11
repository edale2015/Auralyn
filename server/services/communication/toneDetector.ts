export type ToneType = "frustrated" | "demanding" | "anxious" | "neutral";

const FRUSTRATED_PHRASES = [
  "nothing is helping",
  "this is ridiculous",
  "i've been here multiple times",
  "still not better",
  "tried everything",
  "nothing works",
  "so frustrated",
  "this is not working",
];

const DEMANDING_PHRASES = [
  "i want antibiotics",
  "just give me something stronger",
  "i need a zpack",
  "i need a z-pak",
  "i want a zpack",
  "i want a z-pak",
  "give me antibiotics",
  "just prescribe",
  "i demand",
];

const ANXIOUS_PHRASES = [
  "i'm worried",
  "im worried",
  "is this serious",
  "could this be something bad",
  "am i going to be okay",
  "is it cancer",
  "what if it gets worse",
  "i'm scared",
  "im scared",
  "really concerned",
];

export function detectTone(text: string): ToneType {
  const lower = text.toLowerCase();

  if (FRUSTRATED_PHRASES.some(p => lower.includes(p))) return "frustrated";
  if (DEMANDING_PHRASES.some(p => lower.includes(p))) return "demanding";
  if (ANXIOUS_PHRASES.some(p => lower.includes(p))) return "anxious";
  return "neutral";
}

export function detectToneScore(text: string): Record<ToneType, number> {
  const lower = text.toLowerCase();
  return {
    frustrated: FRUSTRATED_PHRASES.filter(p => lower.includes(p)).length,
    demanding:  DEMANDING_PHRASES.filter(p => lower.includes(p)).length,
    anxious:    ANXIOUS_PHRASES.filter(p => lower.includes(p)).length,
    neutral:    0,
  };
}
