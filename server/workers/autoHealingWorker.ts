import { parentPort } from 'node:worker_threads';

setInterval(() => {
  parentPort?.postMessage({ type: 'auto_healer_tick', at: new Date().toISOString() });
}, 10_000);
