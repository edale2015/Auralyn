import fs from "fs/promises";
import path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");
const GOVERNANCE_FILE = path.join(RUNTIME_DIR, "rule_governance_metadata.json");

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

async function loadMetadata(): Promise<Record<string, any>> {
  try {
    const raw = await fs.readFile(GOVERNANCE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMetadata(data: Record<string, any>) {
  await ensureDir();
  await fs.writeFile(GOVERNANCE_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getRuleGovernanceMetadata() {
  return loadMetadata();
}

export async function updateRuleGovernanceMetadata(params: {
  ruleKey: string;
  owner?: string;
  status?: string;
  lastReviewedAt?: string;
  linkedComplaints?: string[];
  notes?: string;
}) {
  const all = await loadMetadata();

  all[params.ruleKey] = {
    ...(all[params.ruleKey] ?? {}),
    owner: params.owner ?? all[params.ruleKey]?.owner ?? "",
    status: params.status ?? all[params.ruleKey]?.status ?? "active",
    lastReviewedAt:
      params.lastReviewedAt ??
      all[params.ruleKey]?.lastReviewedAt ??
      new Date().toISOString(),
    linkedComplaints:
      params.linkedComplaints ?? all[params.ruleKey]?.linkedComplaints ?? [],
    notes: params.notes ?? all[params.ruleKey]?.notes ?? "",
    updatedAt: new Date().toISOString(),
  };

  await saveMetadata(all);

  return {
    ok: true,
    ruleKey: params.ruleKey,
    record: all[params.ruleKey],
  };
}
