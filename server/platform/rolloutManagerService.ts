import fs from "fs/promises";
import path from "path";
import { getPlatformConfig } from "./platformConfig";

const OVERRIDE_DIR = path.resolve(process.cwd(), "server/data/runtime");
const OVERRIDE_FILE = path.join(OVERRIDE_DIR, "rollout_overrides.json");

async function ensureDir() {
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
}

async function loadOverrides(): Promise<Record<string, Record<string, string>>> {
  try {
    const raw = await fs.readFile(OVERRIDE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveOverrides(data: Record<string, Record<string, string>>) {
  await ensureDir();
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getRolloutModes(siteId = "default") {
  const cfg = getPlatformConfig(siteId);
  const overrides = await loadOverrides();
  const siteOverrides = overrides[siteId] ?? {};

  const merged: Record<string, string> = {};
  for (const complaint of cfg.enabledComplaints) {
    merged[complaint] =
      siteOverrides[complaint] ??
      (cfg.rolloutModes as Record<string, string>)?.[complaint] ??
      "sequential";
  }

  return {
    siteId,
    modes: merged,
  };
}

export async function setRolloutMode(params: {
  siteId?: string;
  complaint: string;
  mode: "sequential" | "graph" | "compare";
}) {
  const siteId = params.siteId ?? "default";
  const overrides = await loadOverrides();

  overrides[siteId] ??= {};
  overrides[siteId][params.complaint] = params.mode;

  await saveOverrides(overrides);

  return {
    ok: true,
    siteId,
    complaint: params.complaint,
    mode: params.mode,
  };
}
