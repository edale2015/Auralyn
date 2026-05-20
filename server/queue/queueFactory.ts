import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';

let _conn: IORedis | null = null;
let _unavailable = false;   // true after first failed probe — never retry

/**
 * Returns the shared ioredis connection, or null if Redis is unreachable.
 *
 * Strategy:
 *  - First call: create client, attempt eager connect (3 s timeout).
 *    On failure: mark _unavailable = true so every subsequent call is instant.
 *  - Subsequent calls: return cached client or null immediately — no TCP.
 */
async function getRedisConnectionAsync(): Promise<IORedis | null> {
  if (_unavailable) return null;
  if (_conn) return _conn;

  const url = process.env.REDIS_URL;
  if (!url || url.startsWith('http')) {
    _unavailable = true;
    return null;
  }

  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: () => null,  // one shot only
  });

  client.on('error', () => {/* suppress */});
  client.on('close', () => { _conn = null; _unavailable = true; });
  client.on('end',   () => { _conn = null; _unavailable = true; });

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') throw new Error('unexpected ping response');
    _conn = client;
    return _conn;
  } catch {
    client.disconnect();
    _unavailable = true;
    return null;
  }
}

/** Sync probe: true only after a successful async probe has been cached. */
export function isRedisAvailable(): boolean {
  return !_unavailable && _conn !== null;
}

export interface QueueFactoryOptions<T = unknown> {
  name: string;
  processor?: Processor<T>;
  defaultJobOptions?: JobsOptions;
}

export async function createDurableQueue<T = unknown>(options: QueueFactoryOptions<T>): Promise<{
  queue: Queue<T> | null;
  worker?: Worker<T>;
}> {
  const connection = await getRedisConnectionAsync();
  if (!connection) {
    console.warn(`[queueFactory] Redis unavailable — queue "${options.name}" is disabled`);
    return { queue: null };
  }

  const queue = new Queue<T>(options.name, {
    connection,
    defaultJobOptions: options.defaultJobOptions ?? {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  const worker = options.processor
    ? new Worker<T>(options.name, options.processor, { connection, concurrency: 10 })
    : undefined;

  return { queue, worker };
}
