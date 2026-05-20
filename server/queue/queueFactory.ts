import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';

let _conn: IORedis | null = null;

function getRedisConnection(): IORedis | null {
  if (_conn) return _conn;

  const url = process.env.REDIS_URL;
  if (!url || url.startsWith('http')) return null;

  try {
    _conn = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,      // fail fast — don't wait 30 s for TCP timeout
      retryStrategy: () => null, // no reconnect loop — fall back to in-memory
    });
    _conn.on('error', () => {
      // suppress — connection unavailable in this env; queues use in-memory fallback
    });
    return _conn;
  } catch {
    return null;
  }
}

export interface QueueFactoryOptions<T = unknown> {
  name: string;
  processor?: Processor<T>;
  defaultJobOptions?: JobsOptions;
}

export function createDurableQueue<T = unknown>(options: QueueFactoryOptions<T>): {
  queue: Queue<T> | null;
  worker?: Worker<T>;
} {
  const connection = getRedisConnection();
  if (!connection) {
    console.warn(`[queueFactory] No ioredis-compatible REDIS_URL — queue "${options.name}" is disabled`);
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
