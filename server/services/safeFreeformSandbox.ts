import type { CaseState } from "../../shared/agentTypes";

export interface SandboxResult {
  enabled: boolean;
  allowed: boolean;
  blockedReason?: string;
  educationBlocks: Array<{
    topic: string;
    content: string;
    citedRecommendation: string;
  }>;
}

export function evaluateSandboxEligibility(state: CaseState): SandboxResult {
  if (state.redFlagGate?.gateResult === "ER_SEND") {
    return { enabled: false, allowed: false, blockedReason: "ER_SEND active — sandbox disabled", educationBlocks: [] };
  }

  if (state.routing.state === "EMERGENT_ESCALATION") {
    return { enabled: false, allowed: false, blockedReason: "EMERGENT_ESCALATION — sandbox disabled", educationBlocks: [] };
  }

  if (state.confidence?.global === "LOW") {
    return { enabled: true, allowed: false, blockedReason: "Confidence too LOW — sandbox requires MODERATE or HIGH", educationBlocks: [] };
  }

  const blocks: SandboxResult["educationBlocks"] = [];

  if (state.careGaps && state.careGaps.length > 0) {
    for (const gap of state.careGaps.slice(0, 3)) {
      blocks.push({
        topic: `Care Gap: ${gap.domain} — ${gap.gap_id}`,
        content: generateEducationContent(gap.domain, gap.recommended_action),
        citedRecommendation: gap.recommended_action,
      });
    }
  }

  if (state.spotInterventions && state.spotInterventions.length > 0) {
    for (const si of state.spotInterventions.slice(0, 2)) {
      if (si.safetyClass === "education" || si.safetyClass === "spot_intervention") {
        blocks.push({
          topic: `Intervention: ${si.contextCondition}`,
          content: generateInterventionEducation(si),
          citedRecommendation: si.actions[0] || si.contextCondition,
        });
      }
    }
  }

  return {
    enabled: true,
    allowed: true,
    educationBlocks: blocks,
  };
}

function generateEducationContent(domain: string, action: string): string {
  const templates: Record<string, string> = {
    DM: "Understanding your diabetes management is important. Your healthcare team recommends monitoring and preventive care to keep you healthy.",
    HTN: "Blood pressure management involves regular monitoring and medication adherence. This recommendation helps prevent complications.",
    GLP1: "Your GLP-1 medication works best with lifestyle modifications. This recommendation supports your treatment goals.",
    BARIATRIC: "Post-bariatric care includes ongoing nutritional monitoring. This recommendation helps prevent deficiencies.",
    ANTICOAG: "Anticoagulation therapy requires regular monitoring. This recommendation ensures your safety.",
    ACCESS: "Accessing regular primary care is important for managing chronic conditions. We can help you find resources.",
  };
  return templates[domain] || `This recommendation supports your ongoing care: ${action}`;
}

function generateInterventionEducation(si: any): string {
  const actionText = si.actions?.slice(0, 2).join("; ") || "";
  return `Based on your clinical assessment, your care team may recommend: ${actionText}. This is a deterministic recommendation from established clinical protocols.`;
}
