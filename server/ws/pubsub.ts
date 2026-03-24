import { getRedisClient } from "../redis/redisClient";

type MessageHandler = (data: unknown) => void;

const localBus: Map<string, MessageHandler[]> = new Map();

export async function publish(channel: string, data: unknown): Promise<void> {
  const redis = await getRedisClient();
  const payload = JSON.stringify(data);

  if (redis) {
    try {
      await redis.publish(channel, payload);
      return;
    } catch (e: any) {
      console.warn(`[PubSub] Redis publish failed for "${channel}": ${e?.message} — falling back to local bus`);
    }
  }

  const handlers = localBus.get(channel) ?? [];
  for (const h of handlers) {
    try {
      h(data);
    } catch {}
  }
}

export async function subscribe(
  channel: string,
  handler: MessageHandler
): Promise<void> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const sub = redis.duplicate();
      await sub.subscribe(channel);
      sub.on("message", (_: string, msg: string) => {
        try {
          handler(JSON.parse(msg));
        } catch {}
      });
      console.log(`[PubSub] Redis subscribed to channel "${channel}"`);
      return;
    } catch (e: any) {
      console.warn(`[PubSub] Redis subscribe failed for "${channel}": ${e?.message} — using local bus`);
    }
  }

  const handlers = localBus.get(channel) ?? [];
  handlers.push(handler);
  localBus.set(channel, handlers);
  console.log(`[PubSub] Local bus subscribed to channel "${channel}"`);
}
