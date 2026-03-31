import { complaintPacks } from "../config/complaintPacks";
import { ComplaintPack } from "../../shared/complaintPacks";
import { evaluateRule } from "./ruleParser";
import { getKbRedFlagsSync } from "../kb/kbRuntime";

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

  // ── Layer 1: hardcoded pack trigger IDs ──────────────────────────────────
  const anyPackRedFlag = pack.redFlagTriggers.some(
    flag => answers[flag] === true || answers[flag] === "yes"
  );

  for (const flag of pack.redFlagTriggers) {
    if (answers[flag] === true || answers[flag] === "yes") {
      reasons.push(`red_flag:${flag}`);
      escalate = true;
    }
  }

  // ── Layer 2: KB red flag rules (expression-based) ─────────────────────────
  // These are loaded from the Postgres kb_red_flag_rules table via kbRuntime cache.
  // triggerExpr is evaluated using the same ruleParser that handles autoEscalateRules.
  const kbRedFlags = getKbRedFlagsSync(pack.complaintId);
  let anyKbRedFlag = false;
  for (const rf of kbRedFlags) {
    if (rf.triggerExpr) {
      try {
        const hit = evaluateRule(
          rf.triggerExpr,
          answers as Record<string, string | boolean | number>,
          { anyRedFlag: anyPackRedFlag }
        );
        if (hit) {
          reasons.push(`kb_red_flag:${rf.ruleId}:${rf.action}`);
          anyKbRedFlag = true;
          if (rf.severity === "HARD" || rf.action === "ER_SEND" || rf.action === "CALL_911" || rf.action === "ER_NOW") {
            escalate = true;
          } else {
            review = true;
          }
        }
      } catch {
        // ignore malformed expressions
      }
    }
  }

  const anyRedFlag = anyPackRedFlag || anyKbRedFlag;

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
