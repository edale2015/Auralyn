import { getRulesForFlow } from "./kvRuleLoader";
import { RED_FLAG_MAP } from "./redFlagMap";

type ComputeCtx = {
  flowId?: string;
  system?: string;
  complaint?: string;
  spreadsheetIdOverride?: string;
};

type Proposal = {
  disposition: string;
  redFlag: boolean;
  rulePacks: {
    testPack?: string;
    medPack?: string;
    referralPack?: string;
  };
  reasoning: string[];
};

export async function computeProposalGeneric(
  answers: Record<string, any>,
  ctx?: ComputeCtx
): Promise<Proposal> {

  const flowId = ctx?.flowId || "ENT_FLU_LIKE_V1";

  let rules: Record<string, string> = {};
  try {
    rules = await getRulesForFlow(flowId, ctx?.spreadsheetIdOverride);
  } catch (e) {
    console.warn(`[computeProposalGeneric] getRulesForFlow(${flowId}) failed:`, e);
  }

  // Prefer UPSERT-safe composite key, then plain RED_FLAG_QIDS (backwards compat), then code fallback
  const compositeKey = `${flowId}::RED_FLAG_QIDS`;
  const sheetQidsRaw = (rules[compositeKey] || rules["RED_FLAG_QIDS"] || "").trim();

  const sheetQids = sheetQidsRaw
    ? sheetQidsRaw.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const redFlagQids = sheetQids.length ? sheetQids : (RED_FLAG_MAP[flowId] || []);
  const redFlag = redFlagQids.some(qid => answers[qid] === "Yes");

  const redDisp =
    rules[`${flowId}_RED_FLAG_DISPOSITION`] ||
    rules["RED_FLAG_DISPOSITION"] ||
    "urgent_or_ed";

  const nonRedDisp =
    rules[`${flowId}_NON_RED_FLAG_DISPOSITION`] ||
    rules["NON_RED_FLAG_DISPOSITION"] ||
    "routine_or_supportive";

  const disposition = redFlag ? redDisp : nonRedDisp;

  const testPack =
    rules[`${flowId}_TEST_PACK`] ||
    rules["TEST_PACK"] ||
    undefined;

  const medPack =
    rules[`${flowId}_MED_PACK`] ||
    rules["MED_PACK"] ||
    undefined;

  const referralPack =
    rules[`${flowId}_REFERRAL_PACK`] ||
    rules["REFERRAL_PACK"] ||
    undefined;

  const reasoning: string[] = [];

  if (redFlag) {
    reasoning.push(
      `Red flag triggered by answers: ${redFlagQids.filter(q => answers[q] === "Yes").join(", ")}`
    );
    reasoning.push(`Disposition set to "${disposition}" per red-flag rules`);
  } else {
    reasoning.push("No red-flag answers detected");
    reasoning.push(`Disposition set to "${disposition}" per non-red-flag rules`);
  }

  if (testPack) reasoning.push(`Test pack suggested: ${testPack}`);
  if (medPack) reasoning.push(`Medication pack suggested: ${medPack}`);
  if (referralPack) reasoning.push(`Referral pack suggested: ${referralPack}`);

  return {
    disposition,
    redFlag,
    rulePacks: {
      testPack,
      medPack,
      referralPack,
    },
    reasoning,
  };
}
