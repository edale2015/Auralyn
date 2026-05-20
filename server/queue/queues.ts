let bullmqAvailable = false;

interface QueueShim {
  add(name: string, data: any, opts?: { priority?: number }): Promise<{ id: string }>;
  getWaitingCount(): Promise<number>;
  name: string;
}

interface WorkerShim {
  close(): Promise<void>;
}

const inMemoryQueues: Map<string, Array<{ name: string; data: any; priority: number; id: string }>> = new Map();
const inMemoryWorkers: Map<string, Array<(data: any) => Promise<void>>> = new Map();

function createInMemoryQueue(name: string): QueueShim {
  if (!inMemoryQueues.has(name)) inMemoryQueues.set(name, []);
  return {
    name,
    async add(jobName: string, data: any, opts?: { priority?: number }) {
      const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const q = inMemoryQueues.get(name)!;
      q.push({ name: jobName, data, priority: opts?.priority ?? 10, id });
      q.sort((a, b) => a.priority - b.priority);
      const handlers = inMemoryWorkers.get(name) ?? [];
      if (handlers.length > 0) {
        const item = q.shift();
        if (item) {
          setImmediate(() =>
            handlers[0](item.data).catch((e: any) =>
              console.error(`[InMemoryQueue:${name}] Worker error:`, e?.message)
            )
          );
        }
      }
      return { id };
    },
    async getWaitingCount() {
      return inMemoryQueues.get(name)?.length ?? 0;
    },
  };
}

export let postQueue: QueueShim;
export let rpaQueue: QueueShim;
export let learningQueue: QueueShim;

async function tryUpstashConnection(): Promise<any | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url, token });
    await client.ping();
    // Wrap as an ioredis-compatible connection object for BullMQ
    // BullMQ needs a raw ioredis connection — Upstash REST is not compatible with BullMQ
    // So we return null here; BullMQ will use in-memory. Redis ops use @upstash/redis directly.
    return null;
  } catch {
    return null;
  }
}

async function initQueues() {
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL && !process.env.UPSTASH_REDIS_REST_URL && process.env.USE_FAKE_QUEUE !== "true") {
    throw new Error("❌ [STARTUP FATAL] Redis is required in production. Set UPSTASH_REDIS_REST_URL or REDIS_URL.");
  }

  // BullMQ requires a native ioredis TCP connection (not REST).
  // Only attempt if REDIS_URL looks like a standard non-Upstash endpoint.
  // Upstash REST URLs are used by @upstash/redis directly — not ioredis.
  const redisUrl = process.env.REDIS_URL;
  const isUpstashTcp = redisUrl?.includes("upstash.io");
  if (redisUrl && !isUpstashTcp) {
    try {
      const { Queue } = await import("bullmq");
      const IORedis = (await import("ioredis")).default;
      const conn = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 4000,
        retryStrategy: () => null,
      });
      conn.on('error', () => {/* suppress — TCP unavailable in this env */});
      await Promise.race([
        conn.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      const pong = await conn.ping();
      if (pong !== "PONG") throw new Error("ping failed");

      postQueue = new Queue("post", { connection: conn }) as unknown as QueueShim;
      rpaQueue = new Queue("rpa", { connection: conn }) as unknown as QueueShim;
      learningQueue = new Queue("learning", { connection: conn }) as unknown as QueueShim;
      bullmqAvailable = true;
      console.log("[Queues] BullMQ initialized — post, rpa, learning queues ready (Redis backend)");
      return;
    } catch (e: any) {
      console.warn(`[Queues] BullMQ/Redis TCP unavailable — falling back to in-memory queues`);
    }
  }

  postQueue = createInMemoryQueue("post");
  rpaQueue = createInMemoryQueue("rpa");
  learningQueue = createInMemoryQueue("learning");
  console.log("[Queues] In-memory queues initialized — post, rpa, learning");
}

export async function addPostJob(data: any): Promise<void> {
  await postQueue.add("log+learn", data, { priority: 2 });
}

export async function addRpaJob(data: any): Promise<void> {
  await rpaQueue.add("rpa", data, { priority: 5 });
}

export async function addLearningJob(data: any): Promise<void> {
  await learningQueue.add("learn", data, { priority: 3 });
}

export async function getQueueDepths(): Promise<Record<string, number>> {
  const [post, rpa, learning] = await Promise.all([
    postQueue?.getWaitingCount() ?? 0,
    rpaQueue?.getWaitingCount() ?? 0,
    learningQueue?.getWaitingCount() ?? 0,
  ]);
  return { post, rpa, learning, backend: bullmqAvailable ? "bullmq" : "in-memory" } as any;
}

initQueues().catch((e: any) => console.error("[Queues] Init failed:", e?.message));
