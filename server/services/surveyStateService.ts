const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstashCmd(cmd: any[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.result;
}

export type SurveyPhase = "csat" | "nps";

export async function setSurveyState(channel: string, threadId: string, sessionId: string, phase: SurveyPhase): Promise<void> {
  const key = `survey:${channel}:${threadId}`;
  await upstashCmd(["SET", key, `${sessionId}:${phase}`, "EX", "3600"]);
}

export async function getSurveyState(channel: string, threadId: string): Promise<{ sessionId: string; phase: SurveyPhase } | null> {
  const key = `survey:${channel}:${threadId}`;
  const val = await upstashCmd(["GET", key]);
  if (!val || typeof val !== "string") return null;
  const [sessionId, phase] = val.split(":");
  if (!sessionId || !phase) return null;
  return { sessionId, phase: phase as SurveyPhase };
}

export async function clearSurveyState(channel: string, threadId: string): Promise<void> {
  const key = `survey:${channel}:${threadId}`;
  await upstashCmd(["DEL", key]);
}
