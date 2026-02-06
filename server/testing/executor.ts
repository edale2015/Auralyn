import { Scenario, SystemOutput } from "./types";

function resolveBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const domains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || "";
  const first = domains.split(",")[0]?.trim();
  if (first) return `https://${first}`;
  return "";
}
const BASE_URL = resolveBaseUrl().replace(/\/+$/, "");
const TEST_EXEC_TOKEN = process.env.TEST_EXEC_TOKEN || "";
const TEST_SHEET_ENV = process.env.TEST_SHEET_ENV || "";

export async function executeScenario(s: Scenario): Promise<SystemOutput> {
  if (!BASE_URL) throw new Error("Missing PUBLIC_BASE_URL");
  if (!TEST_EXEC_TOKEN) throw new Error("Missing TEST_EXEC_TOKEN");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-test-token": TEST_EXEC_TOKEN,
  };
  if (TEST_SHEET_ENV) {
    headers["x-sheet-env"] = TEST_SHEET_ENV;
  }

  const resp = await fetch(`${BASE_URL}/api/test/execute`, {
    method: "POST",
    headers,
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
