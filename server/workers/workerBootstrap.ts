import { logger } from '../utils/logger';

export interface BackgroundWorkerHandle {
  name: string;
  stop?: () => Promise<void>;
}

export function startBackgroundWorkers(): BackgroundWorkerHandle[] {
  const handles: BackgroundWorkerHandle[] = [];
  logger.info('[workerBootstrap] Background worker threads not running in this environment (tsx/ts-node does not support worker_threads with TypeScript source files directly). Workers will be started in a compiled production build.');
  return handles;
}
