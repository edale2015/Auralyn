import type { CaseState } from "../../../shared/agentTypes";

export type OutputChannel = "web" | "whatsapp" | "telegram" | "ecw";

export interface FormattedObesityOutput {
  channel: OutputChannel;
  sections: FormattedSection[];
  raw: ObesityOutputData;
}

export interface FormattedSection {
  type: "spot_intervention" | "escalation" | "education" | "er_send" | "tests" | "referral" | "bundles";
  title: string;
  body: string;
}

export interface ObesityOutputData {
  spotInterventions: CaseState["spotInterventions"];
  redFlags: string[];
  recommendedActions: CaseState["recommendedActions"];
  ruleTrace: Array<{ ruleId: string; action: string; detail: string }>;
  bundlesAdded: string[];
  routing: CaseState["routing"];
  metabolic?: CaseState["metabolic"];
  dm?: CaseState["dm"];
  htn?: CaseState["htn"];
  glp1?: CaseState["glp1"];
}

export function extractObesityOutputData(state: CaseState, bundlesAdded: string[]): ObesityOutputData {
  const obesityRules = (state.ruleTrace || []).filter(r => r.triggerLevel === "OBESITY_AGENT");
  return {
    spotInterventions: state.spotInterventions || [],
    redFlags: state.redFlags || [],
    recommendedActions: state.recommendedActions || [],
    ruleTrace: obesityRules.map(r => ({ ruleId: r.ruleId, action: r.action, detail: r.detail })),
    bundlesAdded,
    routing: state.routing,
    metabolic: state.metabolic,
    dm: state.dm,
    htn: state.htn,
    glp1: state.glp1,
  };
}

export function formatObesityOutput(data: ObesityOutputData, channel: OutputChannel): FormattedObesityOutput {
  switch (channel) {
    case "web": return formatRich(data, channel);
    case "whatsapp": return formatShortCard(data, channel);
    case "telegram": return formatShortCard(data, channel);
    case "ecw": return formatEcw(data, channel);
    default: return formatRich(data, channel);
  }
}

function formatRich(data: ObesityOutputData, channel: OutputChannel): FormattedObesityOutput {
  const sections: FormattedSection[] = [];

  if (data.redFlags.length > 0) {
    sections.push({
      type: "er_send",
      title: "URGENT: Red Flags Detected",
      body: data.redFlags.map(f => `- ${f}`).join("\n") +
        "\n\nImmediate ER evaluation recommended.",
    });
  }

  for (const si of data.spotInterventions) {
    const parts: string[] = [];
    parts.push(`Context: ${si.contextCondition}`);
    if (si.actions.length > 0) {
      parts.push("\nRecommended Actions:");
      si.actions.forEach(a => parts.push(`  - ${a}`));
    }
    if (si.testsIfAvailable.length > 0) {
      parts.push("\nTests (if available):");
      si.testsIfAvailable.forEach(t => parts.push(`  - ${t}`));
    }
    if (si.doNotDo.length > 0) {
      parts.push("\nDo NOT:");
      si.doNotDo.forEach(d => parts.push(`  - ${d}`));
    }
    if (si.referralWindow) {
      parts.push(`\nReferral Window: ${si.referralWindow}`);
    }
    if (si.erTriggers.length > 0) {
      parts.push("\nER Triggers:");
      si.erTriggers.forEach(e => parts.push(`  - ${e}`));
    }

    sections.push({ type: "spot_intervention", title: si.interventionId, body: parts.join("\n") });
  }

  const educationRules = data.ruleTrace.filter(r => r.action === "EDUCATION_BLOCK");
  for (const rule of educationRules) {
    sections.push({ type: "education", title: `Education: ${rule.ruleId}`, body: rule.detail });
  }

  const testRules = data.ruleTrace.filter(r => r.action === "TEST_SUGGESTION");
  for (const rule of testRules) {
    sections.push({ type: "tests", title: `Suggested Tests: ${rule.ruleId}`, body: rule.detail });
  }

  if (data.bundlesAdded.length > 0) {
    sections.push({
      type: "bundles",
      title: "Follow-up Bundles",
      body: data.bundlesAdded.map(b => `- ${b}`).join("\n"),
    });
  }

  return { channel, sections, raw: data };
}

function formatShortCard(data: ObesityOutputData, channel: OutputChannel): FormattedObesityOutput {
  const sections: FormattedSection[] = [];

  if (data.redFlags.length > 0) {
    sections.push({
      type: "er_send",
      title: "RED FLAG",
      body: `${data.redFlags.join(", ")} — Go to ER immediately.`,
    });
  }

  for (const si of data.spotInterventions) {
    const topActions = si.actions.slice(0, 3);
    let body = topActions.map((a, i) => `${i + 1}. ${a}`).join("\n");
    if (si.erTriggers.length > 0) {
      body += `\n\nGo to ER if: ${si.erTriggers.slice(0, 2).join(", ")}`;
    }
    if (si.referralWindow) {
      body += `\nFollow-up: ${si.referralWindow}`;
    }
    sections.push({
      type: "spot_intervention",
      title: si.interventionId.replace(/^SI_/, "").replace(/_/g, " "),
      body,
    });
  }

  const educationRules = data.ruleTrace.filter(r => r.action === "EDUCATION_BLOCK");
  for (const rule of educationRules) {
    const short = rule.detail.length > 160 ? rule.detail.slice(0, 157) + "..." : rule.detail;
    sections.push({ type: "education", title: rule.ruleId, body: short });
  }

  if (data.bundlesAdded.length > 0) {
    sections.push({
      type: "bundles",
      title: "Follow-up",
      body: data.bundlesAdded.join(", "),
    });
  }

  return { channel, sections, raw: data };
}

function formatEcw(data: ObesityOutputData, channel: OutputChannel): FormattedObesityOutput {
  const sections: FormattedSection[] = [];

  const apLines: string[] = [];
  apLines.push("--- Metabolic Triage (AI-Assisted) ---");

  if (data.redFlags.length > 0) {
    apLines.push(`RED FLAGS: ${data.redFlags.join(", ")}`);
    apLines.push(">> IMMEDIATE ER EVALUATION RECOMMENDED <<");
    apLines.push("");
  }

  if (data.htn?.hasHTN) {
    apLines.push(`HTN: On ${data.htn.meds?.length ?? 0} agent(s)`);
    if ((data.htn.meds?.length ?? 0) >= 3) apLines.push("  Note: Resistant HTN pattern (3+ agents)");
  }
  if (data.dm?.hasDM) {
    apLines.push(`DM ${data.dm.type ?? ""}: On ${data.dm.meds?.length ?? 0} medication(s)`);
    if (data.dm.ketoneRisk) apLines.push("  Note: Ketone risk present");
    if (data.dm.hypoHistory) apLines.push("  Note: Hypoglycemia risk (sulfonylurea/insulin)");
  }
  if (data.glp1?.agent) {
    apLines.push(`GLP-1: ${data.glp1.agent}${data.glp1.dose ? ` ${data.glp1.dose}` : ""}`);
    if ((data.glp1.sideEffects?.length ?? 0) > 0) apLines.push(`  Side effects: ${data.glp1.sideEffects!.join(", ")}`);
  }
  if (data.metabolic?.bmi) {
    apLines.push(`BMI: ${data.metabolic.bmi}`);
  }

  apLines.push("");

  for (const si of data.spotInterventions) {
    apLines.push(`[${si.interventionId}] ${si.contextCondition}`);
    si.actions.forEach(a => apLines.push(`  - ${a}`));
    if (si.testsIfAvailable.length > 0) {
      apLines.push(`  Tests: ${si.testsIfAvailable.join(", ")}`);
    }
    apLines.push("");
  }

  sections.push({
    type: "spot_intervention",
    title: "Assessment/Plan — Metabolic",
    body: apLines.join("\n"),
  });

  const orderLines: string[] = [];
  orderLines.push("--- Suggested Orders ---");

  const testActions = (data.recommendedActions || []).filter(a => a.type.startsWith("TEST_"));
  if (testActions.length > 0) {
    orderLines.push("Labs:");
    testActions.forEach(a => {
      const name = a.type.replace("TEST_", "").replace(/_/g, " ");
      orderLines.push(`  [ ] ${name}`);
    });
  }

  const referrals = (data.recommendedActions || []).filter(a => a.type.startsWith("REFER_"));
  if (referrals.length > 0) {
    orderLines.push("Referrals:");
    referrals.forEach(a => {
      const name = a.type.replace("REFER_", "").replace(/_/g, " ");
      orderLines.push(`  [ ] ${name}`);
    });
  }

  if (data.bundlesAdded.length > 0) {
    orderLines.push("Follow-up Plans:");
    data.bundlesAdded.forEach(b => orderLines.push(`  [ ] ${b}`));
  }

  if (data.redFlags.length > 0) {
    orderLines.push("CRITICAL:");
    orderLines.push("  [ ] ER referral/transfer");
  }

  if (orderLines.length > 1) {
    sections.push({
      type: "tests",
      title: "Suggested Orders",
      body: orderLines.join("\n"),
    });
  }

  return { channel, sections, raw: data };
}

export function renderSectionsAsText(output: FormattedObesityOutput): string {
  return output.sections.map(s => `[${s.title}]\n${s.body}`).join("\n\n");
}
