import type { JobsOptions } from "bullmq";

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

export const criticalJobOptions: JobsOptions = {
  ...defaultJobOptions,
  attempts: 5,
  priority: 1,
};

export const lowPriorityJobOptions: JobsOptions = {
  ...defaultJobOptions,
  priority: 10,
};
