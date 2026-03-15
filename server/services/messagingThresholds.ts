import fs from 'node:fs';
import path from 'node:path';

export interface ChannelThreshold {
  channel: string;
  dailyLimit: number;
  hourlyLimit: number;
  perRecipientDailyLimit: number;
  enabled: boolean;
  alertOnBreach: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface ThresholdBreachEvent {
  channel: string;
  breachType: 'daily' | 'hourly' | 'per_recipient';
  current: number;
  limit: number;
  recipientId?: string;
  timestamp: string;
}

const STORE_FILE = path.join(process.cwd(), 'messaging_thresholds.ndjson');
const EVENTS_FILE = path.join(process.cwd(), 'messaging_threshold_events.ndjson');

const defaults: ChannelThreshold[] = [
  { channel: 'whatsapp', dailyLimit: 500, hourlyLimit: 60, perRecipientDailyLimit: 5, enabled: true, alertOnBreach: true, updatedAt: new Date().toISOString(), updatedBy: 'system' },
  { channel: 'telegram', dailyLimit: 1000, hourlyLimit: 100, perRecipientDailyLimit: 10, enabled: true, alertOnBreach: true, updatedAt: new Date().toISOString(), updatedBy: 'system' },
  { channel: 'sms', dailyLimit: 250, hourlyLimit: 30, perRecipientDailyLimit: 3, enabled: true, alertOnBreach: true, updatedAt: new Date().toISOString(), updatedBy: 'system' },
  { channel: 'email', dailyLimit: 2000, hourlyLimit: 200, perRecipientDailyLimit: 20, enabled: true, alertOnBreach: false, updatedAt: new Date().toISOString(), updatedBy: 'system' },
];

const thresholds: Record<string, ChannelThreshold> = {};

(function init() {
  if (fs.existsSync(STORE_FILE)) {
    fs.readFileSync(STORE_FILE, 'utf8')
      .split('\n').filter(Boolean)
      .forEach((l) => {
        try { const t = JSON.parse(l) as ChannelThreshold; thresholds[t.channel] = t; } catch {}
      });
  }
  // Seed defaults for any missing channel
  for (const d of defaults) {
    if (!thresholds[d.channel]) {
      thresholds[d.channel] = d;
    }
  }
})();

export function listThresholds(): ChannelThreshold[] {
  return Object.values(thresholds);
}

export function getThreshold(channel: string): ChannelThreshold | undefined {
  return thresholds[channel];
}

export function setThreshold(
  channel: string,
  updates: Partial<Omit<ChannelThreshold, 'channel' | 'updatedAt'>>,
  updatedBy: string
): ChannelThreshold {
  const existing = thresholds[channel] ?? { channel, dailyLimit: 500, hourlyLimit: 60, perRecipientDailyLimit: 5, enabled: true, alertOnBreach: true, updatedAt: '', updatedBy: '' };
  const updated: ChannelThreshold = { ...existing, ...updates, channel, updatedAt: new Date().toISOString(), updatedBy };
  thresholds[channel] = updated;
  _rewrite();
  return updated;
}

// ── Breach event log ─────────────────────────────────────────────────────────

export function logBreachEvent(event: ThresholdBreachEvent): void {
  try { fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n'); } catch {}
}

export function listBreachEvents(limit = 50): ThresholdBreachEvent[] {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => { try { return JSON.parse(l) as ThresholdBreachEvent; } catch { return null; } })
    .filter((e): e is ThresholdBreachEvent => e !== null)
    .reverse();
}

// ── Per-channel counter (in-memory, resets every hour) ────────────────────────

const hourlyCounters: Record<string, { count: number; windowStart: number }> = {};
const dailyCounters: Record<string, { count: number; dayKey: string }> = {};
const recipientDailyCounters: Record<string, Record<string, { count: number; dayKey: string }>> = {};

function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function hourKey(): number { return Math.floor(Date.now() / 3_600_000); }

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  breachType?: 'daily' | 'hourly' | 'per_recipient';
}

export function checkThreshold(channel: string, recipientId?: string): CheckResult {
  const t = thresholds[channel];
  if (!t || !t.enabled) return { allowed: true };

  const day = todayKey();
  const hour = hourKey();

  // Hourly check
  if (!hourlyCounters[channel] || hourlyCounters[channel].windowStart !== hour) {
    hourlyCounters[channel] = { count: 0, windowStart: hour };
  }
  if (hourlyCounters[channel].count >= t.hourlyLimit) {
    return { allowed: false, reason: `Hourly limit reached for ${channel} (${t.hourlyLimit}/hr)`, breachType: 'hourly' };
  }

  // Daily check
  if (!dailyCounters[channel] || dailyCounters[channel].dayKey !== day) {
    dailyCounters[channel] = { count: 0, dayKey: day };
  }
  if (dailyCounters[channel].count >= t.dailyLimit) {
    return { allowed: false, reason: `Daily limit reached for ${channel} (${t.dailyLimit}/day)`, breachType: 'daily' };
  }

  // Per-recipient daily check
  if (recipientId) {
    if (!recipientDailyCounters[channel]) recipientDailyCounters[channel] = {};
    if (!recipientDailyCounters[channel][recipientId] || recipientDailyCounters[channel][recipientId].dayKey !== day) {
      recipientDailyCounters[channel][recipientId] = { count: 0, dayKey: day };
    }
    if (recipientDailyCounters[channel][recipientId].count >= t.perRecipientDailyLimit) {
      return { allowed: false, reason: `Per-recipient daily limit reached for ${channel}/${recipientId} (${t.perRecipientDailyLimit}/day)`, breachType: 'per_recipient' };
    }
  }

  return { allowed: true };
}

export function recordSend(channel: string, recipientId?: string): void {
  const day = todayKey();
  const hour = hourKey();

  if (!hourlyCounters[channel] || hourlyCounters[channel].windowStart !== hour) {
    hourlyCounters[channel] = { count: 0, windowStart: hour };
  }
  hourlyCounters[channel].count++;

  if (!dailyCounters[channel] || dailyCounters[channel].dayKey !== day) {
    dailyCounters[channel] = { count: 0, dayKey: day };
  }
  dailyCounters[channel].count++;

  if (recipientId) {
    if (!recipientDailyCounters[channel]) recipientDailyCounters[channel] = {};
    if (!recipientDailyCounters[channel][recipientId] || recipientDailyCounters[channel][recipientId].dayKey !== day) {
      recipientDailyCounters[channel][recipientId] = { count: 0, dayKey: day };
    }
    recipientDailyCounters[channel][recipientId].count++;
  }
}

export function getCurrentUsage(): Record<string, { hourly: number; daily: number }> {
  const day = todayKey();
  const hour = hourKey();
  const result: Record<string, { hourly: number; daily: number }> = {};
  for (const ch of Object.keys(thresholds)) {
    result[ch] = {
      hourly: (hourlyCounters[ch]?.windowStart === hour ? hourlyCounters[ch].count : 0),
      daily: (dailyCounters[ch]?.dayKey === day ? dailyCounters[ch].count : 0),
    };
  }
  return result;
}

function _rewrite(): void {
  const lines = Object.values(thresholds).map((t) => JSON.stringify(t)).join('\n');
  fs.writeFileSync(STORE_FILE, lines + '\n');
}
