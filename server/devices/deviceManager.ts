import { trace } from "../lib/traceLogger";

export type DeviceReading =
  | { type: "bp"; systolic: number; diastolic: number; pulse: number }
  | { type: "spo2"; value: number; perfusion_index?: number }
  | { type: "ekg"; waveform: number[]; bpm: number; rhythm: string }
  | { type: "temp"; celsius: number; fahrenheit: number }
  | { type: "glucose"; mgdl: number; mmoll: number }
  | { type: "weight"; kg: number; lbs: number };

export interface DeviceStatus {
  device: string;
  online: boolean;
  lastSeen?: string;
  firmwareVersion?: string;
}

const DEVICE_API = process.env.DEVICE_API ?? "";
const DEVICE_TIMEOUT_MS = 5000;

async function fetchDevice(path: string, device: string): Promise<Record<string, unknown>> {
  if (!DEVICE_API) {
    return simulateDevice(device);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);

  try {
    const res = await fetch(`${DEVICE_API}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Device ${device} returned HTTP ${res.status}`);
    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error(`Device ${device} timed out after ${DEVICE_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function simulateDevice(device: string): Record<string, unknown> {
  switch (device) {
    case "bp":
      return { type: "bp", systolic: 118 + Math.round(Math.random() * 20), diastolic: 75 + Math.round(Math.random() * 10), pulse: 70 + Math.round(Math.random() * 20), simulated: true };
    case "spo2":
      return { type: "spo2", value: 96 + Math.round(Math.random() * 3), perfusion_index: 2.5 + Math.random(), simulated: true };
    case "ekg":
      return { type: "ekg", waveform: generateSinusWaveform(), bpm: 72 + Math.round(Math.random() * 10), rhythm: "normal_sinus", simulated: true };
    case "temp":
      const c = 36.5 + Math.random() * 1.5;
      return { type: "temp", celsius: parseFloat(c.toFixed(1)), fahrenheit: parseFloat((c * 9 / 5 + 32).toFixed(1)), simulated: true };
    case "glucose":
      const mgdl = 85 + Math.round(Math.random() * 40);
      return { type: "glucose", mgdl, mmoll: parseFloat((mgdl / 18.02).toFixed(1)), simulated: true };
    case "weight":
      const kg = 60 + Math.round(Math.random() * 40);
      return { type: "weight", kg, lbs: parseFloat((kg * 2.20462).toFixed(1)), simulated: true };
    default:
      throw new Error(`Unknown device: ${device}`);
  }
}

function generateSinusWaveform(): number[] {
  const samples = 20;
  return Array.from({ length: samples }, (_, i) => {
    const t = i / samples;
    const p = i === 4 ? 0.25 : 0;
    const q = i === 5 ? -0.15 : 0;
    const r = i === 6 ? 1.2 : 0;
    const s = i === 7 ? -0.2 : 0;
    const tWave = i >= 11 && i <= 14 ? 0.3 * Math.sin((i - 11) * Math.PI / 3) : 0;
    return parseFloat((0.05 * Math.sin(2 * Math.PI * t) + p + q + r + s + tWave).toFixed(3));
  });
}

export async function readDevice(device: string): Promise<DeviceReading> {
  trace("device_manager", "read_request", { device });

  const data = await fetchDevice(`/${device}`, device);

  trace("device_manager", "read_complete", { device, simulated: Boolean(data.simulated) });

  return data as unknown as DeviceReading;
}

export async function readMultiple(devices: string[]): Promise<Record<string, DeviceReading | { error: string }>> {
  const results = await Promise.allSettled(devices.map((d) => readDevice(d)));
  return Object.fromEntries(
    devices.map((d, i) => [
      d,
      results[i].status === "fulfilled"
        ? results[i].value
        : { error: (results[i] as PromiseRejectedResult).reason?.message ?? "read failed" },
    ])
  );
}

export async function getDeviceStatus(device: string): Promise<DeviceStatus> {
  if (!DEVICE_API) {
    return { device, online: false, lastSeen: undefined, firmwareVersion: "sim-1.0.0" };
  }
  try {
    const data = await fetchDevice(`/${device}/status`, device);
    return { device, online: Boolean(data.online), lastSeen: data.lastSeen as string, firmwareVersion: data.firmware as string };
  } catch {
    return { device, online: false };
  }
}

export function detectSTElevation(waveform: number[]): boolean {
  if (waveform.length < 10) return false;
  const rPeak = Math.max(...waveform);
  const rIdx = waveform.indexOf(rPeak);
  const stSegment = waveform.slice(rIdx + 1, rIdx + 5);
  if (stSegment.length < 1) return false;
  const stMax = Math.max(...stSegment.slice(0, 2));
  const baseline = waveform.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  return stMax - baseline > 1.5;
}

export function detectAFib(waveform: number[]): boolean {
  if (waveform.length < 10) return false;
  const diffs = waveform.slice(1).map((v, i) => Math.abs(v - waveform[i]));
  const variance = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return variance > 0.5;
}
