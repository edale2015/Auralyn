export const QUEUE_NAMES = {
  TRIAGE: "triage",
  NOTIFICATION: "notification",
  LEARNING: "learning",
  GOLDEN_CASE: "golden-case",
  AUTO_HEALING: "auto-healing",
  AUDIT: "audit",
  EHR_OUTBOUND: "ehr-outbound",
  EXPLANATION: "explanation",
  WEBHOOK: "webhook",
  REPORT: "report",
  METRICS: "metrics",
  CARE_GAP: "care-gap-detection",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES = Object.values(QUEUE_NAMES) as QueueName[];
