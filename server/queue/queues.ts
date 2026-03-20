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

async function initQueues() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { Queue } = await import("bullmq");
      const IORedis = (await import("ioredis")).default;
      const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
      await conn.connect().catch(() => { throw new Error("Redis ping failed"); });

      postQueue = new Queue("post", { connection: conn }) as unknown as QueueShim;
      rpaQueue = new Queue("rpa", { connection: conn }) as unknown as QueueShim;
      learningQueue = new Queue("learning", { connection: conn }) as unknown as QueueShim;
      bullmqAvailable = true;
      console.log("[Queues] BullMQ initialized — post, rpa, learning queues ready (Redis backend)");
      return;
    } catch (e: any) {
      console.warn(`[Queues] BullMQ/Redis unavailable (${e?.message}) — falling back to in-memory queues`);
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
