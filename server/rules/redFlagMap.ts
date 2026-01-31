import { FLOW_SPECS } from "../testing/specs";

export const RED_FLAG_MAP: Record<string, string[]> = Object.fromEntries(
  FLOW_SPECS.map(s => [s.flowId, s.redFlagYesQuestionIds])
);
