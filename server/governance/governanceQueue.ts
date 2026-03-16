export type GovernanceStatus = "pending" | "approved" | "rejected";

export interface GovernanceItem {
  id: string;
  sheet: string;
  change: any;
  status: GovernanceStatus;
  risk: string;
  reason?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  timestamp: number;
}

const governanceQueue: GovernanceItem[] = [];

export function addGovernanceItem(item: Omit<GovernanceItem, "status" | "timestamp"> & Partial<GovernanceItem>) {
  governanceQueue.push({
    status: "pending",
    timestamp: Date.now(),
    ...item,
  } as GovernanceItem);
}

export function listGovernanceQueue(filter?: { status?: GovernanceStatus; sheet?: string }) {
  let items = [...governanceQueue];
  if (filter?.status) items = items.filter((i) => i.status === filter.status);
  if (filter?.sheet) items = items.filter((i) => i.sheet === filter.sheet);
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

export function getGovernanceItem(id: string): GovernanceItem | undefined {
  return governanceQueue.find((i) => i.id === id);
}

export function updateGovernanceStatus(id: string, status: GovernanceStatus, reviewedBy?: string): boolean {
  const item = governanceQueue.find((i) => i.id === id);
  if (!item) return false;
  item.status = status;
  item.reviewedBy = reviewedBy;
  item.reviewedAt = Date.now();
  return true;
}

export function getGovernanceStats() {
  const byStatus: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const bySheet: Record<string, number> = {};

  governanceQueue.forEach((item) => {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byRisk[item.risk] = (byRisk[item.risk] ?? 0) + 1;
    bySheet[item.sheet] = (bySheet[item.sheet] ?? 0) + 1;
  });

  return {
    total: governanceQueue.length,
    pending: byStatus.pending ?? 0,
    approved: byStatus.approved ?? 0,
    rejected: byStatus.rejected ?? 0,
    byRisk,
    bySheet,
  };
}
