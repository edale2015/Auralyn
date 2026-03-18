import { complaintPacks } from "../config/complaintPacks";
import { ComplaintPack } from "../../shared/complaintPacks";
import { evaluateRule } from "./ruleParser";

export function findComplaintPack(chiefComplaint: string): ComplaintPack | null {
  const normalized = chiefComplaint.trim().toLowerCase();

  for (const pack of complaintPacks) {
    if (pack.complaintId === normalized) return pack;
    if (pack.aliases.some(a => normalized.includes(a.toLowerCase()))) return pack;
  }

  return null;
}

export function getInitialQuestions(chiefComplaint: string, maxQuestions = 4) {
  const pack = findComplaintPack(chiefComplaint);
  if (!pack) return [];

  return [...pack.coreQuestions]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxQuestions);
}

export function getNextComplaintQuestion(
  chiefComplaint: string,
  answeredKeys: string[]
) {
  const pack = findComplaintPack(chiefComplaint);
  if (!pack) return null;

  return [...pack.coreQuestions]
    .sort((a, b) => a.priority - b.priority)
    .find(q => !answeredKeys.includes(q.id)) || null;
}

export function evaluateComplaintEscalation(
  chiefComplaint: string,
  answers: Record<string, string | boolean | number | null>
) {
  const pack = findComplaintPack(chiefComplaint);
  if (!pack) {
    return {
      matched: false,
      escalate: false,
      review: true,
      reasons: ["no_pack_found"],
    };
  }

  const reasons: string[] = [];
  let escalate = false;
  let review = false;

  const anyRedFlag = pack.redFlagTriggers.some(
    flag => answers[flag] === true || answers[flag] === "yes"
  );

  for (const flag of pack.redFlagTriggers) {
    if (answers[flag] === true || answers[flag] === "yes") {
      reasons.push(`red_flag:${flag}`);
      escalate = true;
    }
  }

  for (const rule of pack.autoEscalateRules) {
    if (evaluateRule(rule, answers as Record<string, string | boolean | number>, { anyRedFlag })) {
      if (!reasons.includes(`escalate_rule:${rule}`)) {
        reasons.push(`escalate_rule:${rule}`);
      }
      escalate = true;
    }
  }

  for (const rule of pack.autoReviewRules) {
    if (evaluateRule(rule, answers as Record<string, string | boolean | number>, { anyRedFlag })) {
      reasons.push(`review_rule:${rule}`);
      review = true;
    }
  }

  return {
    matched: true,
    escalate,
    review,
    reasons,
    likelyDisposition: pack.likelyDisposition,
    planTemplateKey: pack.planTemplateKey,
  };
}
