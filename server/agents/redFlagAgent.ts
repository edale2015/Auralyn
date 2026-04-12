import { MedicalAgent } from "../core/MedicalAgent";
import { FlowContext } from "../core/FlowContext";

export class RedFlagAgent extends MedicalAgent {
  constructor() {
    super({
      name:     "redFlagAgent",
      consumes: ["vitals"],
      provides: ["redFlags"],
    });
  }

  async run(ctx: FlowContext): Promise<FlowContext> {
    const vitals   = ctx.get<Record<string, number>>("vitals");
    const symptoms = ctx.tryGet<Record<string, boolean>>("symptoms") ?? {};
    const redFlags: string[] = [];

    const hr        = Number(vitals.hr   ?? 0);
    const spo2      = Number(vitals.spo2 ?? 99);
    const sbp       = Number(vitals.systolicBP ?? 120);
    const rr        = Number(vitals.rr   ?? 16);
    const tempF     = Number(vitals.tempF ?? 98.6);
    const chestPain = Boolean(symptoms.chestPain);
    const confusion = Boolean(symptoms.confusion);
    const sob       = Boolean(symptoms.sob);

    if (chestPain && hr > 120)      redFlags.push("possible_PE_or_ACS");
    if (spo2 <= 90)                 redFlags.push("critical_hypoxia");
    if (sbp < 90)                   redFlags.push("shock_risk");
    if (rr >= 30)                   redFlags.push("respiratory_failure");
    if (tempF >= 103 && confusion)  redFlags.push("possible_sepsis");
    if (sob && spo2 <= 92)          redFlags.push("cardiopulmonary_compromise");

    const out = ctx.clone();
    out.set("redFlags", redFlags);
    return out;
  }
}
