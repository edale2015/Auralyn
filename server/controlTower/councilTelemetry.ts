import { getRedisAsync } from "../queue/redis";

const PREFIX = "telemetry:council";

export async function logCouncilTelemetry(
  council: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return;
    const key = `${PREFIX}:${council}`;
    await redis.lpush(key, JSON.stringify({ ts: Date.now(), ...payload }));
    await redis.ltrim(key, 0, 199);
  } catch {
  }
}

export async function getCouncilTelemetry(): Promise<Record<string, unknown[]>> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return {};

    const result: Record<string, unknown[]> = {};
    for (const council of ["master", "cardiology", "infectious_disease", "icu"]) {
      const key = `${PREFIX}:${council}`;
      if (typeof (redis as any).lrange === "function") {
        const entries = await (redis as any).lrange(key, 0, 49);
        if (entries?.length) {
          result[council] = entries.map((v: string) => {
            try { return JSON.parse(v); } catch { return v; }
          });
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}
