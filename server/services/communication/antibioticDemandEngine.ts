import { detectAntibioticDemand } from "./antibioticDemandDetector";

export interface AntibioticDemandInput {
  patientText?: string;
  hasBacterialCriteria: boolean;
  priorAntibiotics: boolean;
  centorScore?: number;
}

export interface AntibioticDemandOutput {
  triggered: boolean;
  script: string;
  offerDelayedRx: boolean;
  rationale: string[];
  demandSignal?: ReturnType<typeof detectAntibioticDemand>;
}

const SCRIPT_BACTERIAL_CRITERIA_MET = `I hear you—and based on your symptoms and exam today, this does look like something antibiotics can help with. Let's go ahead and treat it appropriately.`;

const SCRIPT_NO_CRITERIA = `I hear you—you know how your symptoms usually progress, and you've seen this pattern before.

My goal is the same as yours—to treat this early if it's going to turn into something that actually needs treatment.

The tricky part is that most early sore throats are viral, and antibiotics like a Z-Pak don't actually prevent that progression—they only help in specific bacterial cases.

What I'd rather do is time it so you get treatment when it will actually help. If you develop things like fever, worsening throat pain, or other specific symptoms, that's when antibiotics become useful.

If it would make you more comfortable, we can also set this up so you don't have to come back—I can give you a prescription to use only if those symptoms develop.

That way we're not just treating early—we're treating effectively.`;

const SCRIPT_BORDERLINE = `I hear you—and I take your sense of your own body seriously. Let me explain where I am with this.

Right now your exam is on the borderline—not clearly bacterial yet, but I don't want to just dismiss your concern.

Here's what I'd suggest: let's treat the symptoms aggressively today, and I'll give you a backup prescription to start if you develop fever, severe throat pain, or you're not improving in 48 hours.

That way you're covered without us pulling the trigger on antibiotics before they'll actually work.`;

export function generateAntibioticDemandResponse(
  input: AntibioticDemandInput
): AntibioticDemandOutput {
  const demandSignal = detectAntibioticDemand(input.patientText);

  if (!demandSignal.isDemandingAntibiotic) {
    return {
      triggered: false,
      script: "",
      offerDelayedRx: false,
      rationale: [],
      demandSignal,
    };
  }

  if (input.hasBacterialCriteria) {
    return {
      triggered: true,
      script: SCRIPT_BACTERIAL_CRITERIA_MET,
      offerDelayedRx: false,
      rationale: ["bacterial_criteria_met"],
      demandSignal,
    };
  }

  const isBorderline = (input.centorScore ?? 0) >= 2;

  return {
    triggered: true,
    script: isBorderline ? SCRIPT_BORDERLINE : SCRIPT_NO_CRITERIA,
    offerDelayedRx: true,
    rationale: [
      "demand_without_criteria",
      ...(isBorderline ? ["centor_borderline"] : []),
      ...(input.priorAntibiotics ? ["prior_antibiotics"] : []),
    ],
    demandSignal,
  };
}
