import { Scenario, SystemOutput } from "./types";

const BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const TEST_EXEC_TOKEN = process.env.TEST_EXEC_TOKEN || "";

export async function executeScenario(s: Scenario): Promise<SystemOutput> {
  if (!BASE_URL) throw new Error("Missing PUBLIC_BASE_URL");
  if (!TEST_EXEC_TOKEN) throw new Error("Missing TEST_EXEC_TOKEN");

  const resp = await fetch(`${BASE_URL}/api/test/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-token": TEST_EXEC_TOKEN,
    },
    body: JSON.stringify({
      flowId: s.flowId,
      answers: s.answers,
      modifiers: s.modifiers || {},
      routerText: s.routerText,
    }),
  });

  const json: any = await resp.json();
  if (!json.ok) throw new Error(`execute failed: ${json.error || resp.status}`);

  const proposal = json.proposal || {};
  return {
    disposition: String(proposal.disposition || ""),
    redFlag: Boolean(proposal.redFlag),
    raw: json,
  };
}
