import { ToneType } from "./toneDetector";

export interface VariantInput {
  tone: ToneType;
  complaint: string;
  priorAntibiotics: boolean;
}

export interface ScriptVariant {
  name: string;
  script: string;
}

const BASE_SCRIPT = `I can see why this is frustrating—coming back this many times means this is really affecting your day-to-day life.

What I'm seeing from your timeline is something we actually see pretty often—after an initial infection, the inflammation can linger even when the infection itself is no longer active.

Since you've been back a few times, I don't want to just repeat the same approach—I want to step back and treat what's actually driving your symptoms now.

At this stage, this behaves more like inflammation rather than something antibiotics would fix, so treatments that calm the airway and reduce inflammation tend to work better.

I want to make sure that if we use antibiotics, it's because they'll actually help you—not just expose you to side effects without benefit.

If this isn't improving or worsens, we'll escalate further.`;

const PRIOR_ANTIBIOTICS_ADDENDUM = `

Given that you've already tried antibiotics this cycle, repeating them is unlikely to add benefit—they've had their chance to act, and what's left is the inflammatory aftermath.`;

export function getScriptVariant(input: VariantInput): ScriptVariant {
  const base = input.priorAntibiotics
    ? BASE_SCRIPT + PRIOR_ANTIBIOTICS_ADDENDUM
    : BASE_SCRIPT;

  if (input.tone === "frustrated") {
    return {
      name: "frustrated_variant",
      script: `I hear you—you've tried things and you're still not better. That's exactly why I want to change the approach instead of repeating what hasn't worked.\n\n${base}`,
    };
  }

  if (input.tone === "demanding") {
    return {
      name: "demanding_variant",
      script: `I understand why you'd want something stronger—I just want to make sure we're using the right treatment for what's actually going on.\n\n${base}`,
    };
  }

  if (input.tone === "anxious") {
    return {
      name: "anxious_variant",
      script: `The good news is this pattern is very common and not dangerous—but I do want to help you feel better faster.\n\n${base}`,
    };
  }

  return { name: "neutral_variant", script: base };
}

export function listVariantNames(): string[] {
  return ["neutral_variant", "frustrated_variant", "demanding_variant", "anxious_variant"];
}
