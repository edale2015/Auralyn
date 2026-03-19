import { getQueueStats, updateQueueConfig } from "../queue/intakeQueue";
import { publish } from "../agents/eventBus";

export interface ScalingTier {
  minQueued: number;
  concurrency: number;
  label: string;
}

const SCALING_TIERS: ScalingTier[] = [
  { minQueued: 2000, concurrency: 100, label: "maximum" },
  { minQueued: 500, concurrency: 50, label: "high" },
  { minQueued: 100, concurrency: 25, label: "medium" },
  { minQueued: 0, concurrency: 10, label: "baseline" },
];

let currentTier = "baseline";
let scalingEnabled = true;
let lastScaleTime = 0;
const scalingLog: Array<{ timestamp: string; fromTier: string; toTier: string; queued: number; concurrency: number }> = [];

export function autoScale(): { tier: string; concurrency: number; queued: number; scaled: boolean } {
  if (!scalingEnabled) {
    const stats = getQueueStats();
    return { tier: currentTier, concurrency: stats.config.concurrency, queued: stats.queued, scaled: false };
  }

  const stats = getQueueStats();
  const queued = stats.queued;

  let targetTier = SCALING_TIERS[SCALING_TIERS.length - 1];
  for (const tier of SCALING_TIERS) {
    if (queued >= tier.minQueued) {
      targetTier = tier;
      break;
    }
  }

  const now = Date.now();
  if (targetTier.label !== currentTier && now - lastScaleTime > 5000) {
    const fromTier = currentTier;
    currentTier = targetTier.label;
    lastScaleTime = now;

    updateQueueConfig({ concurrency: targetTier.concurrency });

    const entry = {
      timestamp: new Date().toISOString(),
      fromTier,
      toTier: currentTier,
      queued,
      concurrency: targetTier.concurrency,
    };
    scalingLog.push(entry);
    if (scalingLog.length > 200) scalingLog.splice(0, scalingLog.length - 200);

    publish("scaler:scaled", entry);

    return { tier: currentTier, concurrency: targetTier.concurrency, queued, scaled: true };
  }

  return { tier: currentTier, concurrency: stats.config.concurrency, queued, scaled: false };
}

let scalerInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoScaler(intervalMs = 10000) {
  if (scalerInterval) return;
  scalerInterval = setInterval(() => autoScale(), intervalMs);
  publish("scaler:started", { intervalMs });
}

export function stopAutoScaler() {
  if (scalerInterval) {
    clearInterval(scalerInterval);
    scalerInterval = null;
    publish("scaler:stopped", {});
  }
}

export function getScalingStatus() {
  const stats = getQueueStats();
  return {
    enabled: scalingEnabled,
    running: scalerInterval !== null,
    currentTier,
    concurrency: stats.config.concurrency,
    queued: stats.queued,
    tiers: SCALING_TIERS,
    recentScaling: scalingLog.slice(-20),
  };
}

export function setScalingEnabled(enabled: boolean) {
  scalingEnabled = enabled;
}
